const puppeteer = require("puppeteer");
const micro = require("micro");
const { prisma } = require("./generated/prisma-client");
const { send, json, createError } = require("micro");
const { router, get, options, post } = require("microrouter");
const cors = require("micro-cors")();
const stripe = require("stripe")("sk_test_0MlrnptIXnNfzxc33n0eepFl");

const optionsHandler = (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Access-Control-Allow-Origin"
  );
  send(res, 200);
};

const generatePDFHandler = async (req, res) => {
  const {
    resume,
    margin,
    websiteUrl,
    themeColor,
    stripeToken,
    email,
    purchaseOption,
    slug
  } = await json(req);
  if (
    !resume ||
    !websiteUrl ||
    !margin ||
    !themeColor ||
    !stripeToken ||
    !purchaseOption
  ) {
    return send(res, 400, "Bad request");
  }
  const PURCHASE_PRICES = { pdfOnly: 100, pdfAndWebsite: 500, code: 1000 };
  if (Object.keys(PURCHASE_PRICES).indexOf(purchaseOption) < 0) {
    return send(res, 400, "Bad request");
  }

  const stripeConfirmation = await stripe.charges.create({
    amount: PURCHASE_PRICES[purchaseOption],
    currency: "usd",
    source: process.env.ENVIRONMENT !== "PRODUCTION" ? "tok_visa" : stripeToken,
    receipt_email: email ? email : null
  });

  if (purchaseOption === "pdfAndWebsite" || purchaseOption === "code") {
    await uploadResumeToDatabase(slug, resume, themeColor);
  }

  const { left: marginLeft, right: marginRight } = margin;

  const browser = await puppeteer.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });
  const page = await browser.newPage();
  await page.goto(websiteUrl);
  page.emulateMedia("screen");

  await page.evaluate(
    async ({ resume, themeColor }) => {
      debugger;
      await window.loadJson(resume, themeColor);
      const selectors = Array.from(document.querySelectorAll("img"));
      await Promise.all(
        selectors.map(img => {
          if (img.complete) return;
          return new Promise((resolve, reject) => {
            img.addEventListener("load", resolve);
            img.addEventListener("error", reject);
          });
        })
      );
    },
    { resume, themeColor }
  );

  const pdf = await page.pdf({
    margin: { left: marginLeft, right: marginRight }
  });
  await browser.close();
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", "attachment");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Length", pdf.length);
  return send(res, 200, pdf);
};

const getResumeHandler = async (req, res) => {
  const { query } = await req;
  const { slug } = query;
  if (!slug) {
    return createError(400, "No slug found");
  }
  const resume = await prisma.resume({ urlSlug: slug })
    .$fragment(`fragment CompleteResume on Resume {
      themeColor
      urlSlug
      general {
        address
        email
        firstName
        lastName
        github
        phoneNumber
      }
      education {
        dateEnded
        fieldOfStudy
        location
        name
      }
      hobbies {
        icon
        link
        name
      }
      workHistory {
        company
        endDate
        startDate
        location
        position
        tasks
      }
      languages {
        language
        level
      }
      technicalSkills {
        level
        name
      }
}`);
  if (!resume) {
    return createError(404, "Resume not found");
  }
  return resume;
};

const checkUrlSlugHandler = async (req, res) => {
  const { query } = await req;
  const { slug } = query;

  const slugAlreadyExists = await prisma.$exists.resume({ urlSlug: slug });
  if (slug === "" || slug === "/") {
    send(res, 200, { slugAvailable: false });
  }

  return send(res, 200, { slugAvailable: !slugAlreadyExists });
};

const uploadResumeToDatabase = async (slug, resume, themeColor) => {
  const {
    general,
    workHistory,
    education,
    languages,
    hobbies,
    technicalSkills
  } = resume;
  let workHistoryPrepared = [];
  workHistory.forEach(job => {
    const { tasks, ...rest } = job;
    workHistoryPrepared.push({ ...rest, tasks: { set: tasks } });
  });
  const res = await prisma.createResume({
    urlSlug: slug,
    themeColor,
    general: {
      create: { ...general }
    },
    workHistory: { create: workHistoryPrepared },
    languages: { create: [...languages] },
    hobbies: { create: [...hobbies] },
    technicalSkills: { create: [...technicalSkills] },
    education: { create: [...education] }
  });
};

const routes = router(
  post("/", cors(generatePDFHandler)),
  get("/", optionsHandler),
  get("/resume", cors(getResumeHandler)),
  get("/exists", cors(checkUrlSlugHandler)),
  options("/", cors(optionsHandler))
);

const server = micro(routes);

server.listen();

module.exports = routes;

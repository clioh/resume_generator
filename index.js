const puppeteer = require("puppeteer");
const micro = require("micro");
const { send, json } = require("micro");
const { router, get, options, post } = require("microrouter");
const cors = require("micro-cors")();

const optionsHandler = (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Access-Control-Allow-Origin"
  );
  send(res, 200);
};

const generatePDFHandler = async (req, res) => {
  const { resume, margin, websiteUrl } = await json(req);
  if (!resume || !websiteUrl || !margin) {
    return send(res, 400, "Bad request");
  }
  const { left: marginLeft, right: marginRight } = margin;

  const browser = await puppeteer.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });
  const page = await browser.newPage();
  await page.goto(websiteUrl);
  page.emulateMedia("screen");

  await page.evaluate(async resume => {
    await window.loadJson(resume);
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
  }, resume);

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

const routes = router(
  post("/", generatePDFHandler),
  get("/", optionsHandler),
  options("/", cors(optionsHandler))
);

const server = micro(routes);

server.listen();

module.exports = routes;

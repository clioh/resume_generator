"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var prisma_lib_1 = require("prisma-client-lib");
var typeDefs = require("./prisma-schema").typeDefs;

var models = [
  {
    name: "Resume",
    embedded: false
  },
  {
    name: "General",
    embedded: false
  },
  {
    name: "Language",
    embedded: false
  },
  {
    name: "Hobby",
    embedded: false
  },
  {
    name: "Skill",
    embedded: false
  },
  {
    name: "Job",
    embedded: false
  },
  {
    name: "Education",
    embedded: false
  }
];
exports.Prisma = prisma_lib_1.makePrismaClientClass({
  typeDefs,
  models,
  endpoint: `https://us1.prisma.sh/clio-harper/resume/dev`
});
exports.prisma = new exports.Prisma();

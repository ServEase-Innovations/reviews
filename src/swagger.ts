import swaggerJSDoc from "swagger-jsdoc";

const swaggerDefinition = {
  openapi: "3.0.0",
  info: {
    title: "Serveaso Reviews API",
    version: "1.0.0",
    description: "APIs for service provider reviews",
  },
  servers: [
    {
      url: "http://localhost:4000",
      description: "Local server",
    },
  ],
};

const options = {
  swaggerDefinition,
  apis: ["./src/modules/**/*.ts"], // scan controllers & routes
};

export const swaggerSpec = swaggerJSDoc(options);

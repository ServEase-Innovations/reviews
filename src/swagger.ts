import swaggerJSDoc from "swagger-jsdoc";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

const swaggerDefinition = {
  openapi: "3.0.0",
  info: {
    title: "Serveaso Reviews API",
    version: "1.0.0",
    description: "APIs for service provider reviews",
  },
  servers: [
    {
      url: BASE_URL,
      description:
        process.env.NODE_ENV === "production"
          ? "Production server"
          : "Local server",
    },
  ],
};

const options = {
  swaggerDefinition,
  apis: ["./src/modules/**/*.ts"],
};

export const swaggerSpec = swaggerJSDoc(options);

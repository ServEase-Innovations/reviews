import swaggerJSDoc from "swagger-jsdoc";

const BASE_URL =
  process.env.RENDER_EXTERNAL_URL ||
  process.env.BASE_URL ||
  "http://localhost:4000";

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

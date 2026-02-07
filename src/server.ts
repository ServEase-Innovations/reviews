import "dotenv/config";
import app from "./app";



const PORT = parseInt(process.env.PORT || "3000", 10);

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Reviews service running on port ${PORT}`);
});

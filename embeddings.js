const OpenAI = require("openai");
const dotenv = require("dotenv");

dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = "text-embedding-3-small";

const generateEmbedding = async (text, user, model = MODEL) => {
  const embedding = await openai.embeddings.create({
    model: model,
    input: text,
    encoding_format: "float",
    user: user,
  });

  return { embedding: embedding.data[0].embedding, text: text };
};

module.exports = {
  generateEmbedding,
};

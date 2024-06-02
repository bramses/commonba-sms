require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const { createClient } = require("@supabase/supabase-js");
const { generateEmbedding } = require("./embeddings.js");

const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const sender = msg.from.id;

  // Check if the user exists in the database
  let { data: user, error } = await supabase
    .from("users")
    .select("name")
    .eq("telegram_id", sender)
    .single();

  if (!user) {
    await supabase
      .from("users")
      .insert([{ telegram_id: sender, name: msg.from.first_name }]);
    bot.sendMessage(
      chatId,
      `Welcome ${msg.from.first_name}! You can now use the insert and search commands.`
    );
  } else {
    bot.sendMessage(
      chatId,
      "Welcome back! You can use the insert and search commands."
    );
  }
});

bot.onText(/\/name (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const name = match[1];
  const sender = msg.from.id;

  await supabase.from("users").update({ name }).match({ telegram_id: sender });
  bot.sendMessage(chatId, `Thanks, ${name}! Your name was updated.`);
});

bot.onText(/\/insert ([\s\S]+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const content = match[1];
  const sender = msg.from.id;
  const embeddingAwait = await generateEmbedding(content);
  const embedding = embeddingAwait.embedding;

  await supabase
    .from("records")
    .insert([{ telegram_id: sender, content, embedding }]);
  bot.sendMessage(chatId, "Record inserted!");
});

// help message /help
bot.onText(/\/help/, async (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(
    chatId,
    "Commands:\n" +
      "/start - Start the bot\n" +
      "/name [name] - Set your name\n" +
      "/insert [content] - Insert a record\n" +
      "[query] - Search for similar records\n" +
      "/? - Three random records\n"
  );
});

bot.onText(/\/\?/, async (msg) => {
  const chatId = msg.chat.id;
  const sender = msg.from.id;

  // three random records
  let { data, error } = await supabase.rpc("fetch_random_ids");

  if (error) console.error(error);
  else console.log(data);

  // get the records by id
  const records = await supabase
    .from("records")
    .select("content, telegram_id")
    .in(
      "id",
      data.map((r) => r)
    );

  const results = [];
  for await (let record of records.data) {
    const result = {};
    result.content = record.content.trim();
    result.username = await getUsername(record.telegram_id);
    results.push(result);
  }

  // choose random 3 records from the results
  const random_results = [];
  for (let i = 0; i < 3; i++) {
    const random_index = Math.floor(Math.random() * results.length);
    random_results.push(results[random_index]);
    results.splice(random_index, 1);
  }



  if (random_results.length > 0) {
    const reply = random_results
      .map((r, idx) => `${idx + 1}. ${r.content} by ${r.username}`)
      .join("\n---\n");
    bot.sendMessage(chatId, reply);
  } else {
    bot.sendMessage(chatId, "No results found.");
  }
});

const getUsername = async (telegram_id) => {
  const { data: user, error } = await supabase
    .from("users")
    .select("name")
    .eq("telegram_id", telegram_id)
    .single();
  return user.name;
};

bot.on("message", async (msg) => {
  if (msg.text.startsWith("/")) return; // Ignore messages that are commands

  const chatId = msg.chat.id;
  const sender = msg.from.id;
  const query = msg.text.trim();

  const query_embedding_await = await generateEmbedding(query);
  const query_embedding = query_embedding_await.embedding;

  const match_count = 3;
  const match_threshold = 0.0;

  let { data, error } = await supabase.rpc("semantic_search", {
    match_count,
    match_threshold,
    query_embedding,
  });
  if (error) console.error(error);
  else console.log(data);

  const results = [];
  for await (let record of data) {
    const result = {};
    result.content = record.content.trim();
    result.username = await getUsername(record.telegram_id);
    result.timestamp = record.created_at.toString().slice(0, 10);

    results.push(result);
  }

  if (results.length > 0) {
    const reply = results
      .map(
        (r, idx) =>
          `${idx + 1}. ${r.content} | by ${r.username} | written on ${
            r.timestamp
          }`
      )
      .join("\n---\n");
    bot.sendMessage(chatId, reply);
  } else {
    bot.sendMessage(chatId, "No results found.");
  }
});

console.log("Bot is running...");

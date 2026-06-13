const bannedWords = [
  "早餐", "早饭", "餐厅", "停车", "车位", "免费停车",
  "泳池", "健身房", "接送", "机场", "海景", "亲子",
  "会议", "发票", "洗衣", "酒店名称"
];

const allowedKeywords = [
  "干净整洁",
  "服务热情",
  "入住顺利",
  "房间舒适",
  "环境安静",
  "位置方便",
  "体验满意",
  "性价比不错",
  "设施实用",
  "办理高效",
  "休息舒适",
  "整体推荐"
];

function cleanText(text) {
  let cleaned = String(text || "").replace(/\s+/g, "").replace(/[“”]/g, "");
  bannedWords.forEach(word => {
    cleaned = cleaned.split(word).join("");
  });
  return cleaned;
}

function hasBannedWord(text) {
  return bannedWords.some(word => String(text || "").includes(word));
}

function fallbackReview(keywords) {
  const selected = keywords.length ? keywords : ["整体体验不错"];
  const templates = [
    `整体入住体验很满意，${selected.join("、")}都让人感觉不错，过程顺利又省心，是一次比较舒适的住宿体验。`,
    `这次入住感受很好，${selected.join("、")}，整体体验比较舒适，服务和环境都让人满意。`,
    `入住过程很顺利，${selected.join("、")}，整体感觉轻松舒服，是一次比较满意的住宿体验。`,
    `整体体验不错，${selected.join("、")}都挺符合预期，住得比较安心，推荐有需要的人选择。`,
    `这次住宿体验比较满意，${selected.join("、")}，整体感受自然舒适，入住过程也比较省心。`
  ];
  return templates[Math.floor(Math.random() * templates.length)];
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return await new Promise(resolve => {
    let data = "";
    req.on("data", chunk => { data += chunk; });
    req.on("end", () => {
      try { resolve(JSON.parse(data || "{}")); } catch { resolve({}); }
    });
  });
}

module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method !== "POST") {
    res.statusCode = 405;
    res.end(JSON.stringify({ error: "Method Not Allowed" }));
    return;
  }

  try {
    const body = await readBody(req);
    let keywords = Array.isArray(body.keywords) ? body.keywords : [];
    keywords = keywords.filter(word => allowedKeywords.includes(word));

    if (keywords.length === 0) {
      res.end(JSON.stringify({ review: fallbackReview(["整体体验不错"]) }));
      return;
    }

    const systemPrompt = `你是一个酒店住客评价文案助手。请根据用户选择的关键词，生成一条中文酒店好评内容。

硬性要求：
1. 字数必须在30字以上，80字以内。
2. 不要出现任何酒店名称。
3. 不要出现早餐、早饭、餐厅、停车、车位、泳池、健身房、接送、机场、海景、亲子、会议、发票、洗衣等不通用内容。
4. 不要虚构具体设施、楼层、房型、城市、景点。
5. 语气自然，像真实客人写的评价。
6. 只输出一条评价内容，不要解释，不要加标题。
7. 内容必须是正向好评，但不要过度夸张。`;

    const userPrompt = `请根据这些关键词生成酒店好评：${keywords.join("、")}`;

    const aiUrl = process.env.AI_API_URL;
    const aiKey = process.env.AI_API_KEY;
    const model = process.env.AI_MODEL || "gpt-4o-mini";

    if (!aiUrl || !aiKey) {
      res.end(JSON.stringify({ review: fallbackReview(keywords), source: "fallback" }));
      return;
    }

    const aiResponse = await fetch(aiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${aiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.8,
        max_tokens: 160
      })
    });

    const aiData = await aiResponse.json();
    let review = aiData?.choices?.[0]?.message?.content?.trim() || fallbackReview(keywords);
    review = cleanText(review);

    if (review.length < 30 || review.length > 100 || hasBannedWord(review)) {
      review = fallbackReview(keywords);
    }

    res.end(JSON.stringify({ review }));
  } catch (error) {
    res.end(JSON.stringify({ review: "整体入住体验很满意，环境舒适安静，服务也比较热情，入住过程顺利，是一次不错的住宿体验。" }));
  }
};

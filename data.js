// ================= 静态配置数据 =================

// 稀有度档位
const RARITY = [
  { key: 0, name: '常见', color: '#6b7280' },
  { key: 1, name: '稀有', color: '#2563eb' },
  { key: 2, name: '珍贵', color: '#7c3aed' },
  { key: 3, name: '传说', color: '#d97706' },
];

// 鱼饵
const BAITS = [
  { id: 'normal',  name: '普通鱼饵', emoji: '🪱', cost: 4,  rarityBonus: 0, desc: '基础鱼饵，适合日常垂钓' },
  { id: 'premium', name: '高级鱼饵', emoji: '🍤', cost: 12, rarityBonus: 1, desc: '香气浓郁，更容易吸引稀有鱼' },
];

// 渔具（鱼竿）
// reelSpeed = 每格收线把鱼拉近的距离；reelTension = 收线增加的张力；relief = 放线降低的张力
const GEARS = [
  { id: 'wood',   name: '木鱼竿', emoji: '🎣', cost: 0,    maxRarity: 0, reelSpeed: 10, reelTension: 6, relief: 12, desc: '新手入门，只能钓常见鱼' },
  { id: 'bamboo', name: '竹鱼竿', emoji: '🎣', cost: 150,  maxRarity: 1, reelSpeed: 12, reelTension: 5, relief: 16, desc: '更坚韧，可钓稀有鱼' },
  { id: 'carbon', name: '碳素竿', emoji: '🎣', cost: 600,  maxRarity: 2, reelSpeed: 15, reelTension: 4, relief: 20, desc: '轻盈强力，可钓珍贵鱼' },
  { id: 'gold',   name: '黄金竿', emoji: '🎣', cost: 2000, maxRarity: 3, reelSpeed: 18, reelTension: 3, relief: 28, desc: '顶级渔具，传说鱼也手到擒来' },
];

// 鱼类
// type: normal=普通可售 | worthless=无价值 | invasive=入侵物种 | protected=保护动物
// zone: shallow=浅水(近岸) | deep=深水(远投)
// w: 出现权重（越大越常见）；strength: 挣扎拉力（越大越难遛）
// bounty: 入侵物种无害化处理的奖励
const FISH = [
  // 常见（浅水）
  { id: 'crucian',   name: '小鲫鱼',   emoji: '🐟', type: 'normal',    rarity: 0, basePrice: 10,  wmin: 0.2, wmax: 0.8, w: 30, strength: 2,  zone: 'shallow' },
  { id: 'grasscarp', name: '草鱼',     emoji: '🐟', type: 'normal',    rarity: 0, basePrice: 14,  wmin: 0.5, wmax: 1.5, w: 24, strength: 3,  zone: 'shallow' },
  { id: 'carp',      name: '鲤鱼',     emoji: '🐠', type: 'normal',    rarity: 0, basePrice: 18,  wmin: 0.6, wmax: 2.0, w: 20, strength: 3,  zone: 'shallow' },
  // 稀有（深水）
  { id: 'bass',      name: '鲈鱼',     emoji: '🐠', type: 'normal',    rarity: 1, basePrice: 40,  wmin: 0.4, wmax: 1.2, w: 12, strength: 5,  zone: 'deep' },
  { id: 'mandarin',  name: '鳜鱼',     emoji: '🐡', type: 'normal',    rarity: 1, basePrice: 55,  wmin: 0.5, wmax: 1.6, w: 9,  strength: 6,  zone: 'deep' },
  // 珍贵（深水）
  { id: 'arowana',   name: '金龙鱼',   emoji: '🐉', type: 'normal',    rarity: 2, basePrice: 120, wmin: 0.8, wmax: 2.5, w: 5,  strength: 7,  zone: 'deep' },
  { id: 'koi',       name: '锦鲤',     emoji: '🎏', type: 'normal',    rarity: 2, basePrice: 150, wmin: 0.6, wmax: 2.0, w: 5,  strength: 8,  zone: 'deep' },
  // 传说（深水）
  { id: 'ancient',   name: '远古龙鱼', emoji: '🐲', type: 'normal',    rarity: 3, basePrice: 500, wmin: 3.0, wmax: 8.0, w: 2,  strength: 10, zone: 'deep' },
  // 无价值（浅水）
  { id: 'trashfish', name: '小杂鱼',   emoji: '🐟', type: 'worthless', rarity: 0, basePrice: 0,   wmin: 0.05, wmax: 0.3, w: 18, strength: 1,  zone: 'shallow' },
  { id: 'oldboot',   name: '破旧雨靴', emoji: '🥾', type: 'worthless', rarity: 0, basePrice: 0,   wmin: 0.5, wmax: 1.0, w: 8,  strength: 1,  zone: 'shallow' },
  { id: 'tin',       name: '空易拉罐', emoji: '🥫', type: 'worthless', rarity: 0, basePrice: 0,   wmin: 0.1, wmax: 0.3, w: 8,  strength: 1,  zone: 'shallow' },
  // 入侵物种（深水）
  { id: 'pleco',        name: '清道夫鱼', emoji: '🐟', type: 'invasive', rarity: 0, basePrice: 0, bounty: 20, wmin: 0.3, wmax: 1.0, w: 10, strength: 4,  zone: 'deep' },
  { id: 'alligatorgar', name: '鳄雀鳝',   emoji: '🐊', type: 'invasive', rarity: 1, basePrice: 0, bounty: 80, wmin: 1.0, wmax: 3.0, w: 6,  strength: 8,  zone: 'deep' },
  // 保护动物（深水，不可售卖）
  { id: 'sturgeon', name: '中华鲟',   emoji: '🐟', type: 'protected', rarity: 2, basePrice: 0, bounty: 120, wmin: 5.0,  wmax: 15.0, w: 4,  strength: 8,  zone: 'deep' },
  { id: 'porpoise', name: '长江江豚', emoji: '🐬', type: 'protected', rarity: 3, basePrice: 0, bounty: 300, wmin: 20.0, wmax: 45.0, w: 2,  strength: 11, zone: 'deep' },
];

// 稀有度权重兜底（鱼未单独配置 w 时使用）
const RARITY_WEIGHT = { 0: 20, 1: 12, 2: 5, 3: 2 };

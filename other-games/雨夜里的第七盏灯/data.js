(function () {
	const CASE_LIBRARY = {
		seventh_lamp: {
			id: "seventh_lamp",
			title: "雨夜里的第七盏灯",
			subtitle: "交互推理游戏：调查现场、盘问人物、提交指认",
			turnLimit: 10,
			baseTimeMinutes: 21 * 60 + 10,
			initialTimeline: ["21:10 供电正常，馆内照明稳定。"],
			narration: {
				phase1: "暴雨夜，馆长倒在二楼资料室。门内反锁，钥匙失踪。先从人物口供与现场基础物证入手。",
				phase2: "你已经拿到关键片段，下一步是用物证去压测口供，找出谁在制造时间线错位。",
				phase3: "指认窗口已开启。请提交凶手、作案链路与动机，系统将按完整性判定结局。",
				ended: "案件已结案。你可以复盘时间线，或重新开始尝试不同调查顺序。"
			},
			clueDict: {
				lamp_power: "第七盏灯接应急电源，停电时仍可微亮。",
				lin_maintenance: "工具间登记：林岚19:40维修过应急灯。",
				duty_changed: "值班表21:10-21:30记录被人改写。",
				manual_power: "配电室日志显示停电为手动拉闸。",
				witness_sheet: "叶青目击许舟改动值班表。",
				pre_power_room: "叶青证词：停电前许舟已在配电室门口徘徊。",
				window_entry: "资料室窗插销有新划痕，可疑外部进出痕迹。",
				watch_time: "馆长手表停在21:17，死亡时间与雨迹存在错位。",
				mud_tracks: "后门附近有新鲜湿泥脚印，通向外墙排水沟。",
				debt_note: "保安储物柜发现催债短信打印条。"
			},
			characters: [
				{
					id: "lin",
					name: "林岚",
					role: "副馆长",
					portraitClass: "lin",
					short: "冷静强势，注重博物馆名誉",
					tags: ["理性", "防备强", "形象管理"],
					suspicion: 35,
					asked: { alibi: false, oil: false, lamp: false }
				},
				{
					id: "xu",
					name: "许舟",
					role: "保安",
					portraitClass: "xu",
					short: "熟悉巡逻路线，回答细节过多",
					tags: ["执行力", "熟悉场地", "过度解释"],
					suspicion: 48,
					asked: { alibi: false, duty: false, blackout: false }
				},
				{
					id: "ye",
					name: "叶青",
					role: "实习生",
					portraitClass: "ye",
					short: "紧张沉默，似乎有话不敢说",
					tags: ["胆怯", "目击者", "易受安抚"],
					suspicion: 18,
					asked: { corridor: false, dutySheet: false, witness: false }
				}
			],
			actionsByChar: {
				lin: [
					{ key: "alibi", label: "追问停电时的不在场", note: "盘问林岚的不在场陈述。", effects: { log: "林岚：停电时我在前台翻手电，没上楼。语气稳定，但明显在回避细节。", suspicionDelta: 8 } },
					{ key: "oil", label: "质问袖口机油味", note: "针对林岚袖口机油味进行追问。", effects: { log: "林岚：机油来自应急灯维修，工具间应该有登记。她第一次给出可核验信息。", addClues: ["lin_maintenance"], suspicionDelta: -10, suspicionFloor: 20 } },
					{ key: "lamp", label: "询问第七盏灯为何微亮", note: "核实第七盏灯与应急电路关系。", requires: { cluesAll: ["lin_maintenance"] }, effects: { log: "林岚：第七盏灯接在应急电路，停电后可微亮，这解释了走廊可见度。", addClues: ["lamp_power"] } }
				],
				xu: [
					{ key: "alibi", label: "确认他去配电室的时间", note: "核对许舟停电后的行动路线。", effects: { log: "许舟：停电后我立刻去配电室，没离开内场。回答太快，像背过。", suspicionDelta: 6 } },
					{ key: "duty", label: "出示值班表改动", note: "就值班表改动向许舟施压。", requires: { cluesAll: ["witness_sheet"] }, effects: { log: "许舟：那是临时换班，口头同意了。但他说不出谁批准的。", addClues: ["duty_changed"], suspicionDelta: 14 } },
					{ key: "blackout", label: "追问手动拉闸权限与日志", note: "以配电日志对许舟进行二次质询。", requires: { cluesAll: ["manual_power"] }, effects: { log: "许舟：拉闸是正常排查。你指出日志后，他沉默了几秒。", suspicionDelta: 18 } }
				],
				ye: [
					{ key: "corridor", label: "询问她在走廊看见了什么", note: "询问叶青在走廊目击到的细节。", effects: { log: "叶青：我只记得那盏灯还微微亮着，其他我不敢说。她非常紧张。", suspicionDelta: -3, suspicionFloor: 10 } },
					{ key: "dutySheet", label: "安抚后询问揉皱值班表", note: "安抚叶青后追问值班表来源。", effects: { log: "叶青：值班表是许哥改的，我怕说了会被辞退。证词开始松动。", addClues: ["witness_sheet"], suspicionDelta: -5, suspicionFloor: 8 } },
					{ key: "witness", label: "追问停电前的异常动向", note: "进一步核对停电前的可疑动向。", requires: { charAskedAll: ["dutySheet"] }, effects: { log: "叶青：停电前几分钟，许舟先去了配电室门口。时间线出现关键矛盾。", addClues: ["pre_power_room"] } }
				]
			},
			sceneActions: [
				{ key: "window_entry", label: "勘查资料室窗插销划痕", note: "检查资料室窗户及插销痕迹。", effects: { addClues: ["window_entry"] } },
				{ key: "watch_time", label: "核对馆长手表与雨迹时间", note: "比对馆长手表停表时间与地面雨迹。", effects: { addClues: ["watch_time"] } },
				{ key: "manual_power", label: "调阅配电室开关日志", note: "调阅配电室日志，核查停电原因。", effects: { addClues: ["manual_power"] } },
				{ key: "mud_tracks", label: "查看后门外湿泥脚印", note: "在后门及外墙排水沟查验泥痕。", effects: { addClues: ["mud_tracks"] } },
				{ key: "debt_note", label: "检查保安储物柜可疑物", note: "检查许舟储物柜中的个人物品。", requires: { cluesAny: ["duty_changed", "pre_power_room"] }, effects: { addClues: ["debt_note"] } }
			],
			accuse: {
				description: "收集至少6条线索后可提交。你也可以在行动耗尽后强制提交。",
				suspects: [
					{ id: "lin", label: "林岚" },
					{ id: "xu", label: "许舟" },
					{ id: "ye", label: "叶青" }
				],
				chains: [
					{ key: "manual_power", label: "手动拉闸制造停电" },
					{ key: "window_entry", label: "利用窗户插销划痕进出资料室" },
					{ key: "pre_power_room", label: "停电前已接近配电室，提前布置时间线" }
				],
				motives: [
					{ key: "debt", label: "欠债受压，试图盗钥匙引发冲突" },
					{ key: "cover_budget", label: "掩盖预算挪用" },
					{ key: "fear_fired", label: "害怕实习被辞退" }
				],
				solution: {
					suspect: "xu",
					motive: "debt",
					chains: ["manual_power", "window_entry", "pre_power_room"],
					unlockMinClues: 6,
					unlockCriticalClues: ["manual_power", "window_entry", "pre_power_room"]
				},
				endingTexts: {
					wrong: { title: "失败结局：误判", detail: "你指认了错误对象。真正矛盾集中在许舟的停电时间线、窗户痕迹与拉闸日志。", tone: "fail" },
					perfect: { title: "完美结局：雨灯之下", detail: "你完整还原了链路：许舟手动拉闸制造停电，借窗插销痕迹进出资料室，并在停电前提前布置行动轨迹；欠债压力引发盗钥匙冲突。", tone: "ok" },
					normal: { title: "普通结局：锁定真凶", detail: "你成功指认许舟，但作案细节仍有缺口。再补齐关键链路可达完美结局。", tone: "normal" },
					weak: { title: "勉强结局：方向正确", detail: "你猜中许舟，但证据链不完整，难以形成高强度司法口径。", tone: "normal" }
				}
			}
		},
		last_train: {
			id: "last_train",
			title: "雾港末班车",
			subtitle: "新案件：月台封锁后的失踪与坠落",
			turnLimit: 10,
			baseTimeMinutes: 22 * 60,
			initialTimeline: ["22:00 末班车进站，站台广播提示封站。"],
			narration: {
				phase1: "雨夜末班车到站后，站务主任坠落在检修区。封站期间只有三人能自由进出站台。",
				phase2: "证词开始互相冲突。把站务日志、闸机记录和鞋印位置拼成时间链。",
				phase3: "你可以提交指认。请同时锁定凶手、作案路径与动机。",
				ended: "案件已结案。你可以重新挑战，测试不同问话路径。"
			},
			clueDict: {
				c2_gate_override: "闸机记录出现一次手动开闸覆盖。",
				c2_radio_gap: "对讲机在22:07-22:11存在空白通话段。",
				c2_oily_glove: "检修井边发现沾油手套，尺寸偏大。",
				c2_schedule_edit: "班次表被改，韩策巡检区块被临时对调。",
				c2_witness_cart: "陶米看到工具车在封锁前被推入盲区。",
				c2_key_copy: "秦蔓抽屉里有一枚闸机备份钥匙复制单。",
				c2_boot_mark: "检修区湿印鞋纹与韩策工作靴一致。",
				c2_fine_notice: "韩策收到高额违章罚单催缴短信。",
				c2_camera_blind: "摄像头在22:09被切到维护画面。",
				c2_tape_fiber: "坠落点护栏上有工具胶带纤维。"
			},
			characters: [
				{
					id: "qin",
					name: "秦蔓",
					role: "值班站长",
					portraitClass: "qin",
					short: "流程严格，擅长把细节说得很完整",
					tags: ["控场", "流程化", "防御强"],
					suspicion: 38,
					asked: { alibi: false, keyCopy: false, blindCam: false }
				},
				{
					id: "han",
					name: "韩策",
					role: "检修员",
					portraitClass: "han",
					short: "熟悉检修通道，情绪起伏明显",
					tags: ["体力工", "路线熟", "易激动"],
					suspicion: 46,
					asked: { route: false, shift: false, glove: false }
				},
				{
					id: "tao",
					name: "陶米",
					role: "售票员",
					portraitClass: "tao",
					short: "看似中立，但观察很细",
					tags: ["观察者", "谨慎", "怕牵连"],
					suspicion: 20,
					asked: { witness: false, cart: false, radio: false }
				}
			],
			actionsByChar: {
				qin: [
					{ key: "alibi", label: "核对封站时她的位置", note: "盘问秦蔓在封站期间的站台动线。", effects: { log: "秦蔓：我一直在值班室调监控，没离开过控制台。", suspicionDelta: 7 } },
					{ key: "keyCopy", label: "询问备份钥匙复制单", note: "出示钥匙复制单并追问用途。", requires: { cluesAll: ["c2_key_copy"] }, effects: { log: "秦蔓：复制单是上月申请，今天没用过。她强调了三次日期。", suspicionDelta: 9 } },
					{ key: "blindCam", label: "追问22:09摄像头切换", note: "就维护画面切换向秦蔓施压。", requires: { cluesAll: ["c2_camera_blind"] }, effects: { log: "秦蔓：切画面是例行检查，但她无法解释为何刚好对准盲区。", suspicionDelta: 11 } }
				],
				han: [
					{ key: "route", label: "确认检修通道行走路线", note: "核对韩策在检修通道的进出时间。", effects: { log: "韩策：我在井口附近巡检，没去过坠落点。语气明显发紧。", suspicionDelta: 8 } },
					{ key: "shift", label: "出示班次表临时对调", note: "用班次表改动记录追问韩策。", requires: { cluesAll: ["c2_schedule_edit"] }, effects: { log: "韩策：对调是临时安排，不关我的事。", suspicionDelta: 12, addClues: ["c2_boot_mark"] } },
					{ key: "glove", label: "比对沾油手套尺寸", note: "将手套尺寸与韩策装备进行比对。", requires: { cluesAll: ["c2_oily_glove"] }, effects: { log: "韩策：手套不是我的，但你注意到他右手有新磨损。", suspicionDelta: 13 } }
				],
				tao: [
					{ key: "witness", label: "询问封站前后目击", note: "让陶米回忆封站前后的站台异动。", effects: { log: "陶米：我看到有人提前把工具车推进了暗角。", suspicionDelta: -2, suspicionFloor: 10, addClues: ["c2_witness_cart"] } },
					{ key: "cart", label: "追问工具车由谁推动", note: "进一步确认工具车相关目击细节。", requires: { charAskedAll: ["witness"] }, effects: { log: "陶米：像是韩策的背影，但当时灯光很暗。", suspicionDelta: -2, suspicionFloor: 10 } },
					{ key: "radio", label: "核对对讲机空白时段", note: "与陶米核对22:07-22:11对讲机记录。", requires: { cluesAll: ["c2_radio_gap"] }, effects: { log: "陶米：那几分钟只有杂音，我听到有人在跑。", suspicionDelta: -1, suspicionFloor: 10 } }
				]
			},
			sceneActions: [
				{ key: "c2_gate_override", label: "调阅闸机覆盖记录", note: "调阅闸机系统覆盖日志。", effects: { addClues: ["c2_gate_override"] } },
				{ key: "c2_radio_gap", label: "核查对讲机通话时段", note: "核查对讲机在关键时段的通讯记录。", effects: { addClues: ["c2_radio_gap"] } },
				{ key: "c2_oily_glove", label: "勘查检修井边手套", note: "在检修井边搜寻遗留工器具。", effects: { addClues: ["c2_oily_glove", "c2_tape_fiber"] } },
				{ key: "c2_schedule_edit", label: "查看班次表编辑历史", note: "调取班次表后台编辑日志。", effects: { addClues: ["c2_schedule_edit"] } },
				{ key: "c2_key_copy", label: "检查值班抽屉文档", note: "检查值班抽屉中的纸质单据。", requires: { cluesAny: ["c2_gate_override", "c2_schedule_edit"] }, effects: { addClues: ["c2_key_copy"] } },
				{ key: "c2_fine_notice", label: "查看检修员私人物品", note: "核查韩策柜内近期财务通知。", requires: { cluesAny: ["c2_boot_mark", "c2_oily_glove"] }, effects: { addClues: ["c2_fine_notice"] } },
				{ key: "c2_camera_blind", label: "检查摄像头切换日志", note: "调取监控系统画面切换轨迹。", effects: { addClues: ["c2_camera_blind"] } }
			],
			accuse: {
				description: "建议拿到6条以上线索再提交。若行动耗尽，将自动进入指认阶段。",
				suspects: [
					{ id: "qin", label: "秦蔓" },
					{ id: "han", label: "韩策" },
					{ id: "tao", label: "陶米" }
				],
				chains: [
					{ key: "c2_gate_override", label: "利用闸机覆盖制造通行窗口" },
					{ key: "c2_schedule_edit", label: "通过班次对调转移巡检路线" },
					{ key: "c2_oily_glove", label: "在检修井附近遗留沾油手套" }
				],
				motives: [
					{ key: "fine_debt", label: "高额罚款催缴，急需资金" },
					{ key: "promotion", label: "争取升职，排除管理阻碍" },
					{ key: "protect_friend", label: "替朋友顶罪" }
				],
				solution: {
					suspect: "han",
					motive: "fine_debt",
					chains: ["c2_gate_override", "c2_schedule_edit", "c2_oily_glove"],
					unlockMinClues: 6,
					unlockCriticalClues: ["c2_gate_override", "c2_schedule_edit", "c2_oily_glove"]
				},
				endingTexts: {
					wrong: { title: "失败结局：误判", detail: "你的指认与关键物证不匹配。真正矛盾集中在韩策的通行窗口、班次对调和检修物证。", tone: "fail" },
					perfect: { title: "完美结局：末班真相", detail: "你完整还原了作案链路：韩策借闸机覆盖和班次对调进入盲区，并在检修井附近留下关键物证；罚款压力构成直接动机。", tone: "ok" },
					normal: { title: "普通结局：锁定真凶", detail: "你成功锁定韩策，但链路细节仍不完整。补全三段关键链路可达到完美结局。", tone: "normal" },
					weak: { title: "勉强结局：方向正确", detail: "你猜中凶手，但证据拼图不足，无法形成最强结案陈述。", tone: "normal" }
				}
			}
		}
	};

	function deepCloneCharacters(characters) {
		return characters.map((c) => ({
			...c,
			tags: [...c.tags],
			asked: { ...c.asked }
		}));
	}

	function createInitialGameState(caseId) {
		const caseData = CASE_LIBRARY[caseId] || CASE_LIBRARY.seventh_lamp;
		const sceneAsked = {};
		caseData.sceneActions.forEach((action) => {
			sceneAsked[action.key] = false;
		});

		return {
			caseId: caseData.id,
			phase: 1,
			minute: 0,
			turns: caseData.turnLimit,
			accuseUnlocked: false,
			ended: false,
			selectedId: null,
			clues: new Set(),
			log: [],
			timeline: [...caseData.initialTimeline],
			sceneAsked,
			characters: deepCloneCharacters(caseData.characters)
		};
	}

	window.CASE_LIBRARY = CASE_LIBRARY;
	window.createInitialGameState = createInitialGameState;
})();

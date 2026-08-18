(function () {
	const caseLibrary = window.CASE_LIBRARY;
	if (!caseLibrary || typeof window.createInitialGameState !== "function") {
		console.error("CASE_LIBRARY 或 createInitialGameState 未加载");
		return;
	}

	const narrationEl = document.getElementById("narration");
	const charactersEl = document.getElementById("characters");
	const actionsEl = document.getElementById("actions");
	const focusNameEl = document.getElementById("focusName");
	const focusDescEl = document.getElementById("focusDesc");
	const logEl = document.getElementById("log");
	const cluesEl = document.getElementById("clues");
	const hintEl = document.getElementById("hint");
	const phaseTextEl = document.getElementById("phaseText");
	const timeTextEl = document.getElementById("timeText");
	const turnTextEl = document.getElementById("turnText");
	const sceneActionsEl = document.getElementById("sceneActions");
	const timelineEl = document.getElementById("timeline");
	const accuseBtnEl = document.getElementById("accuseBtn");
	const restartBtnEl = document.getElementById("restartBtn");
	const resultBoxEl = document.getElementById("resultBox");
	const motiveSelectEl = document.getElementById("motiveSelect");
	const caseSelectEl = document.getElementById("caseSelect");
	const loadCaseBtnEl = document.getElementById("loadCaseBtn");
	const suspectChoicesEl = document.getElementById("suspectChoices");
	const chainChoicesEl = document.getElementById("chainChoices");

	let currentCaseId = "seventh_lamp";
	let game = window.createInitialGameState(currentCaseId);

	function getCaseData() {
		return caseLibrary[currentCaseId];
	}

	function formatTime(base, add) {
		const total = base + add;
		const h = Math.floor(total / 60);
		const m = total % 60;
		return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
	}

	function getChar(id) {
		return game.characters.find((c) => c.id === id);
	}

	function addLog(text, withTime = true) {
		const baseTime = getCaseData().baseTimeMinutes;
		const prefix = withTime ? `[${formatTime(baseTime, game.minute)}] ` : "";
		game.log.unshift(prefix + text);
		game.log = game.log.slice(0, 6);
	}

	function addClue(clueKey) {
		const caseData = getCaseData();
		if (!caseData.clueDict[clueKey]) return;
		if (game.clues.has(clueKey)) return;
		game.clues.add(clueKey);
		addLog(`获得线索：${caseData.clueDict[clueKey]}`);
	}

	function applyActionEffects(char, effects) {
		if (!effects) return;
		if (effects.log) {
			addLog(effects.log, false);
		}
		if (effects.addClues && effects.addClues.length > 0) {
			effects.addClues.forEach((k) => addClue(k));
		}
		if (char && typeof effects.suspicionDelta === "number") {
			char.suspicion += effects.suspicionDelta;
			if (typeof effects.suspicionFloor === "number") {
				char.suspicion = Math.max(effects.suspicionFloor, char.suspicion);
			}
		}
	}

	function advanceTurn(note, minutes = 5) {
		if (game.ended || game.turns <= 0) return false;
		const baseTime = getCaseData().baseTimeMinutes;
		game.minute += minutes;
		game.turns -= 1;
		if (note) {
			game.timeline.unshift(`${formatTime(baseTime, game.minute)} ${note}`);
			game.timeline = game.timeline.slice(0, 8);
		}
		if (game.turns === 0 && !game.accuseUnlocked) {
			game.accuseUnlocked = true;
			addLog("行动用尽：你必须基于现有证据提交指认。", false);
		}
		return true;
	}

	function meetsRequireSet(requireSet) {
		if (!requireSet || requireSet.length === 0) return true;
		return requireSet.every((k) => game.clues.has(k));
	}

	function meetsRequireAny(requireSet) {
		if (!requireSet || requireSet.length === 0) return true;
		return requireSet.some((k) => game.clues.has(k));
	}

	function isActionLocked(action, char) {
		const req = action.requires;
		if (!req) return false;
		if (req.charAskedAll && req.charAskedAll.length > 0) {
			if (!char) return true;
			const ok = req.charAskedAll.every((k) => !!char.asked[k]);
			if (!ok) return true;
		}
		if (req.cluesAll && req.cluesAll.length > 0 && !meetsRequireSet(req.cluesAll)) {
			return true;
		}
		if (req.cluesAny && req.cluesAny.length > 0 && !meetsRequireAny(req.cluesAny)) {
			return true;
		}
		return false;
	}

	function executeCharAction(char, action) {
		if (!advanceTurn(action.note)) return;
		char.asked[action.key] = true;
		applyActionEffects(char, action.effects);
	}

	function executeSceneAction(action) {
		if (!advanceTurn(action.note)) return;
		game.sceneAsked[action.key] = true;
		applyActionEffects(null, action.effects);
	}

	function updatePhase() {
		const caseData = getCaseData();
		const unlock = caseData.accuse.solution;
		const baseTime = caseData.baseTimeMinutes;

		if (game.ended) {
			phaseTextEl.textContent = "阶段：结案";
			hintEl.textContent = "案件已结算，可点击重新开始体验其他路径。";
			timeTextEl.textContent = `时间：${formatTime(baseTime, game.minute)}`;
			turnTextEl.textContent = `行动剩余：${game.turns}`;
			accuseBtnEl.disabled = true;
			return;
		}

		const minCluesMet = game.clues.size >= unlock.unlockMinClues;
		const criticalMet = unlock.unlockCriticalClues.every((k) => game.clues.has(k));
		if (minCluesMet || criticalMet) {
			game.accuseUnlocked = true;
		}

		if (game.accuseUnlocked) {
			game.phase = 3;
			phaseTextEl.textContent = "阶段：提交指认";
			hintEl.textContent = "你已经可以提交推理。确保凶手、作案链路和动机相互印证。";
		} else if (game.clues.size >= 3) {
			game.phase = 2;
			phaseTextEl.textContent = "阶段：证词交叉验证";
			hintEl.textContent = "关键提示：用物证去压测口供，注意时间线矛盾。";
		} else {
			game.phase = 1;
			phaseTextEl.textContent = "阶段：初步询问";
			hintEl.textContent = "目标：先问出每个人最不愿提的一件事。";
		}

		timeTextEl.textContent = `时间：${formatTime(baseTime, game.minute)}`;
		turnTextEl.textContent = `行动剩余：${game.turns}`;
		accuseBtnEl.disabled = !game.accuseUnlocked;
	}

	function renderCharacters() {
		charactersEl.innerHTML = "";
		game.characters.forEach((c) => {
			const card = document.createElement("article");
			card.className = "card" + (game.selectedId === c.id ? " active" : "");
			card.innerHTML = `
				<div class="portrait ${c.portraitClass}">${c.name.slice(0, 1)}</div>
				<h2 class="name">${c.name}</h2>
				<p class="role">${c.role}</p>
				<div class="tags">${c.tags.map((t) => `<span class="tag">${t}</span>`).join("")}</div>
				<div class="meter"><span style="width:${c.suspicion}%"></span></div>
				<div class="small">当前嫌疑值：${c.suspicion}</div>
			`;
			card.addEventListener("click", () => {
				game.selectedId = c.id;
				render();
			});
			charactersEl.appendChild(card);
		});
	}

	function renderActions() {
		const char = getChar(game.selectedId);
		actionsEl.innerHTML = "";
		const caseData = getCaseData();

		if (!char) {
			focusNameEl.textContent = "先选择一个人物";
			focusDescEl.textContent = "点击左侧角色卡后，这里会显示可执行问话。";
			return;
		}

		focusNameEl.textContent = `当前人物：${char.name}`;
		focusDescEl.textContent = char.short;

		const actionList = caseData.actionsByChar[char.id] || [];
		actionList.forEach((action) => {
			const done = !!char.asked[action.key];
			const locked = isActionLocked(action, char);
			const btn = document.createElement("button");
			btn.textContent = done ? `已完成：${action.label}` : action.label;
			btn.disabled = game.ended || done || locked || game.turns <= 0;
			btn.addEventListener("click", () => {
				executeCharAction(char, action);
				updatePhase();
				render();
			});
			actionsEl.appendChild(btn);
		});
	}

	function renderSceneActions() {
		sceneActionsEl.innerHTML = "";
		const caseData = getCaseData();
		caseData.sceneActions.forEach((action) => {
			const done = !!game.sceneAsked[action.key];
			const locked = isActionLocked(action, null);
			const btn = document.createElement("button");
			btn.textContent = done ? `已完成：${action.label}` : action.label;
			btn.disabled = game.ended || done || locked || game.turns <= 0;
			btn.addEventListener("click", () => {
				executeSceneAction(action);
				updatePhase();
				render();
			});
			sceneActionsEl.appendChild(btn);
		});
	}

	function renderLogs() {
		logEl.innerHTML = "";
		if (game.log.length === 0) {
			logEl.innerHTML = "<li>暂无记录。先选一个人物开始问话。</li>";
			return;
		}
		game.log.forEach((line) => {
			const li = document.createElement("li");
			li.textContent = line;
			logEl.appendChild(li);
		});
	}

	function renderClues() {
		const caseData = getCaseData();
		cluesEl.innerHTML = "";
		if (game.clues.size === 0) {
			cluesEl.innerHTML = "<li>暂无线索。</li>";
			return;
		}
		[...game.clues].forEach((k) => {
			const li = document.createElement("li");
			li.textContent = caseData.clueDict[k] || k;
			cluesEl.appendChild(li);
		});
	}

	function renderTimeline() {
		timelineEl.innerHTML = "";
		game.timeline.forEach((item) => {
			const li = document.createElement("li");
			li.textContent = item;
			timelineEl.appendChild(li);
		});
	}

	function renderNarration() {
		const caseData = getCaseData();
		if (game.ended) {
			narrationEl.textContent = caseData.narration.ended;
			return;
		}
		if (game.phase === 1) {
			narrationEl.textContent = caseData.narration.phase1;
			return;
		}
		if (game.phase === 2) {
			narrationEl.textContent = caseData.narration.phase2;
			return;
		}
		narrationEl.textContent = caseData.narration.phase3;
	}

	function renderCaseMeta() {
		const caseData = getCaseData();
		const titleEl = document.querySelector(".title");
		const subtitleEl = document.querySelector(".subtitle");
		const accuseDescEl = document.querySelector("#resultBox").closest("section.panel").querySelector("p.small");
		titleEl.textContent = caseData.title;
		subtitleEl.textContent = caseData.subtitle;
		accuseDescEl.textContent = caseData.accuse.description;
	}

	function buildAccuseForm() {
		const caseData = getCaseData();
		const accuse = caseData.accuse;

		suspectChoicesEl.innerHTML = "";
		accuse.suspects.forEach((s) => {
			const label = document.createElement("label");
			label.className = "choice";
			label.innerHTML = `<input type="radio" name="suspect" value="${s.id}" />${s.label}`;
			suspectChoicesEl.appendChild(label);
		});

		chainChoicesEl.innerHTML = "";
		accuse.chains.forEach((c) => {
			const label = document.createElement("label");
			label.className = "choice";
			label.innerHTML = `<input type="checkbox" name="chain" value="${c.key}" />${c.label}`;
			chainChoicesEl.appendChild(label);
		});

		motiveSelectEl.innerHTML = "";
		const blank = document.createElement("option");
		blank.value = "";
		blank.textContent = "请选择一个动机";
		motiveSelectEl.appendChild(blank);
		accuse.motives.forEach((m) => {
			const option = document.createElement("option");
			option.value = m.key;
			option.textContent = m.label;
			motiveSelectEl.appendChild(option);
		});

		resultBoxEl.className = "result";
		resultBoxEl.textContent = "尚未提交指认。";
	}

	function clearAccuseInputs() {
		document.querySelectorAll("input[name='suspect']").forEach((input) => {
			input.checked = false;
		});
		document.querySelectorAll("input[name='chain']").forEach((input) => {
			input.checked = false;
		});
		motiveSelectEl.value = "";
		resultBoxEl.className = "result";
		resultBoxEl.textContent = "尚未提交指认。";
	}

	function evaluateAccusation() {
		const caseData = getCaseData();
		const solution = caseData.accuse.solution;
		const endings = caseData.accuse.endingTexts;
		if (!game.accuseUnlocked || game.ended) return;

		const suspectInput = document.querySelector("input[name='suspect']:checked");
		if (!suspectInput) {
			resultBoxEl.className = "result fail";
			resultBoxEl.textContent = "请先选择一名凶手。";
			return;
		}

		const suspect = suspectInput.value;
		const chainChecked = [...document.querySelectorAll("input[name='chain']:checked")].map((i) => i.value);
		const motive = motiveSelectEl.value;

		const chainScore = solution.chains.filter((k) => chainChecked.includes(k)).length;
		const suspectCorrect = suspect === solution.suspect;
		const motiveCorrect = motive === solution.motive;

		game.ended = true;
		let ending = endings.weak;
		if (!suspectCorrect) {
			ending = endings.wrong;
		} else if (chainScore === solution.chains.length && motiveCorrect) {
			ending = endings.perfect;
		} else if (chainScore >= Math.max(2, solution.chains.length - 1)) {
			ending = endings.normal;
		}

		resultBoxEl.className = `result ${ending.tone === "fail" ? "fail" : ending.tone === "ok" ? "ok" : ""}`.trim();
		resultBoxEl.innerHTML = `<strong>${ending.title}</strong><br>${ending.detail}`;

		const suspectLabel = caseData.accuse.suspects.find((s) => s.id === suspect)?.label || suspect;
		addLog(`提交指认：凶手选择 ${suspectLabel}。`, false);
		updatePhase();
		render();
	}

	function renderCaseSelector() {
		caseSelectEl.innerHTML = "";
		Object.values(caseLibrary).forEach((c) => {
			const option = document.createElement("option");
			option.value = c.id;
			option.textContent = c.title;
			if (c.id === currentCaseId) option.selected = true;
			caseSelectEl.appendChild(option);
		});
	}

	function loadCase(caseId) {
		if (!caseLibrary[caseId]) return;
		currentCaseId = caseId;
		game = window.createInitialGameState(caseId);
		renderCaseMeta();
		buildAccuseForm();
		updatePhase();
		render();
	}

	function resetGame() {
		game = window.createInitialGameState(currentCaseId);
		clearAccuseInputs();
		updatePhase();
		render();
	}

	function render() {
		renderNarration();
		renderCharacters();
		renderSceneActions();
		renderActions();
		renderLogs();
		renderClues();
		renderTimeline();
	}

	accuseBtnEl.addEventListener("click", evaluateAccusation);
	restartBtnEl.addEventListener("click", resetGame);
	loadCaseBtnEl.addEventListener("click", () => {
		const nextCaseId = caseSelectEl.value;
		loadCase(nextCaseId);
	});

	renderCaseSelector();
	loadCase(currentCaseId);
})();

import re

with open('js/app_novel.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update doGenerateNovel
old_gen = """  // ─── GENERATE NOVEL ──────────────────────────────────────────
  async function doGenerateNovel() {
    if (state.isGenerating) return;
    if (!localStorage.getItem(SETTINGS_KEY)) { showNovelToast('请先在设置中配置 API Key'); return; }

    state.isGenerating = true;
    var btn = document.getElementById('novel-generate-btn');
    if (btn) { btn.disabled = true; }

    var charaPersonas = state.selectedCharas.map(function(id) {
      var f = (typeof friendsData !== 'undefined') ? friendsData[id] : null;
      if (!f) return '';
      return 'Name: ' + (f.remark || f.realName || id) + '\\nPersona: ' + (f.persona || '未设置');
    }).filter(Boolean).join('\\n---\\n');

    var userPersona = getUserPersona();
    var worldContent = getWorldbookContent(state.selectedCharas);
    var tropeStr = state.currentTropes.length > 0 ? state.currentTropes.join(', ') : '自由发挥';
    var genre = (GENRES.find(function(g) { return g.id === state.generationGenre; }) || { label: '言情' }).label;
    
    var setProgress = function(msg) {
      state.genProgress = msg;
      if (btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + msg;
    };

    setProgress('前期筹备中...');

    // 1. 生成设定集
    let settingPrompt = `请为一部【${genre}】题材的小说生成一份《剧组设定集》。\\n`+
                        `结合要素：${tropeStr}\\n`+
                        `参演AI角色：\\n${charaPersonas}\\n\\n`+
                        `请直接输出设定集，包含：1. 暂定书名（加书名号）；2. 一句话世界观；3. 每个角色在剧中的新身份及性格微调。`;
    
    var settingResult = await callAPI(settingPrompt, 600);
    if (!settingResult) {
        state.isGenerating = false;
        state.genProgress = '';
        if (btn) { btn.innerHTML = '<i class="fas fa-magic"></i> 一键生成 ' + state.booksToGenerate + ' 本小说'; btn.disabled = false; }
        showNovelToast('设定集推演失败，请检查 API 配置');
        return;
    }

    var titleMatch = settingResult.match(/《(.+?)》/);
    var title = titleMatch ? titleMatch[1] : ('时空异卷_' + Date.now().toString().slice(-4));
    
    // 展示设定集对话框
    var settingDialog = document.getElementById('novel-setting-dialog');
    var settingOverlay = document.getElementById('novel-setting-overlay');
    var settingContent = document.getElementById('novel-setting-content');
    if (settingDialog && settingOverlay && settingContent) {
        settingContent.textContent = settingResult;
        settingDialog.style.display = 'flex';
        settingOverlay.style.display = 'block';
    }

    // 挂载确认回调
    window._pendingGenNovel = async function() {
        setProgress('正式开机撰写...');
        var prompt1 = buildTavernPrompt(title, genre, tropeStr, charaPersonas, userPersona, worldContent, "《剧本设定集参考》\\n" + settingResult, true);
        var result1 = await callAPI(prompt1, 2000);

        if (!result1) {
          state.isGenerating = false;
          state.genProgress = '';
          if (btn) { btn.innerHTML = '<i class="fas fa-magic"></i> 一键生成 ' + state.booksToGenerate + ' 本小说'; btn.disabled = false; }
          showNovelToast('正文生成失败');
          return;
        }

        var content1 = result1.replace(/《.+?》/, '').trim();

        var newBook = {
          id: 'gen_' + Date.now(),
          title: title,
          tags: [state.generationGenre],
          cover: randomCover(),
          emoji: randomEmoji(),
          progress: 0,
          totalPages: 1,
          pages: [content1],
          isGenerated: true,
          serial: true,
          charas: state.selectedCharas.slice(),
          tropes: state.currentTropes.slice(),
          meta: { genre: genre, tropeStr: tropeStr, charaPersonas: charaPersonas, userPersona: userPersona, worldContent: worldContent, settingResult: settingResult }
        };
        state.books.push(newBook);
        saveState();

        state.isGenerating = false;
        state.genProgress = '';
        if (btn) { btn.innerHTML = '<i class="fas fa-magic"></i> 一键生成小说'; btn.disabled = false; }
        showNovelToast('✅「' + title + '」序章生成成功！');
        closeGenPanel();
        openBook(newBook);
    };
  }"""

new_gen = """  // ─── GENERATE NOVEL ──────────────────────────────────────────
  async function doGenerateNovel() {
    if (state.isGenerating) return;
    if (!localStorage.getItem(SETTINGS_KEY)) { showNovelToast('请先在设置中配置 API Key'); return; }

    state.isGenerating = true;
    var btn = document.getElementById('novel-generate-btn');
    if (btn) { btn.disabled = true; }

    var charaPersonas = state.selectedCharas.map(function(id) {
      var f = (typeof friendsData !== 'undefined') ? friendsData[id] : null;
      if (!f) return '';
      return 'Name: ' + (f.remark || f.realName || id) + '\\nPersona: ' + (f.persona || '未设置');
    }).filter(Boolean).join('\\n---\\n');

    var userPersona = getUserPersona();
    var worldContent = getWorldbookContent(state.selectedCharas);
    
    var customGenreEl = document.getElementById('novel-custom-genre');
    var customGenre = customGenreEl ? customGenreEl.value.trim() : '';
    var baseGenre = (GENRES.find(function(g) { return g.id === state.generationGenre; }) || { label: '言情' }).label;
    var genre = customGenre ? (baseGenre + '、' + customGenre) : baseGenre;
    
    var tropeStr = state.currentTropes.length > 0 ? state.currentTropes.join(', ') : '自由发挥';
    
    var setProgress = function(msg) {
      state.genProgress = msg;
      if (btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + msg;
    };

    var count = state.booksToGenerate || 1;
    var generatedBooks = [];

    for (let i = 0; i < count; i++) {
        setProgress(`正在生成第 ${i+1}/${count} 本...`);
        
        let settingPrompt = `请为一部【${genre}】题材的小说生成一份极简《设定集》。\\n`+
                            `结合要素：${tropeStr}\\n`+
                            `参演角色：\\n${charaPersonas}\\n\\n`+
                            `请仅返回一段文字，包含：暂定书名（加书名号）、一句话世界观。`;
        
        var settingResult = await callAPI(settingPrompt, 400);
        if (!settingResult) settingResult = `《时空异卷_${Date.now().toString().slice(-4)}》默认世界观`;
        
        var titleMatch = settingResult.match(/《(.+?)》/);
        var title = titleMatch ? titleMatch[1] : ('时空异卷_' + Date.now().toString().slice(-4));
        
        var prompt1 = buildTavernPrompt(title, genre, tropeStr, charaPersonas, userPersona, worldContent, "《设定参考》\\n" + settingResult, true);
        
        // 追加字数要求限制，解决字数太短问题
        prompt1 += "\\n\\n【强制字数要求】：请务必充分展开描写，加入大量对话、心理活动、环境细节。第一章正文内容绝对不能低于1000字！！！尽量往长了写！";
        
        var result1 = await callAPI(prompt1, 3000);
        if (!result1) continue;

        var content1 = result1.replace(/《.+?》/, '').trim();

        var newBook = {
          id: 'gen_' + Date.now() + '_' + i,
          title: title,
          tags: [state.generationGenre],
          cover: randomCover(),
          emoji: randomEmoji(),
          progress: 0,
          totalPages: 1,
          pages: [content1],
          isGenerated: true,
          serial: true,
          charas: state.selectedCharas.slice(),
          tropes: state.currentTropes.slice(),
          meta: { genre: genre, tropeStr: tropeStr, charaPersonas: charaPersonas, userPersona: userPersona, worldContent: worldContent, settingResult: settingResult }
        };
        generatedBooks.push(newBook);
        state.books.push(newBook);
        saveState();
    }

    state.isGenerating = false;
    state.genProgress = '';
    if (btn) { btn.innerHTML = '<i class="fas fa-magic"></i> 一键生成 ' + state.booksToGenerate + ' 本小说'; btn.disabled = false; }
    
    if (generatedBooks.length > 0) {
        showNovelToast(`✅ 成功生成 ${generatedBooks.length} 本小说！`);
        closeGenPanel();
        if (generatedBooks.length === 1) {
            openBook(generatedBooks[0]);
        }
    } else {
        showNovelToast('生成失败');
    }
  }"""

if old_gen in content:
    content = content.replace(old_gen, new_gen)
else:
    print("Warning: old_gen not found!")

# 2. Update buildTavernPrompt for word count
old_prompt = """    if (isFirstChapter) {
        prompt += `请撰写本作的【第一章】（800-1200字）。如果书名未定，请在最开头用《书名》格式输出。\\n开头请直接进入核心场景，制造张力。`;
    } else {
        prompt += `请根据上文续写【下一章】（800-1200字）。\\n【前情提要】\\n${context}\\n`;"""

new_prompt = """    if (isFirstChapter) {
        prompt += `请撰写本作的【第一章】（必须达到 1500 字以上！充分展开每一个细节）。如果书名未定，请在最开头用《书名》格式输出。\\n开头请直接进入核心场景，制造张力，多加对话和环境描写！`;
    } else {
        prompt += `请根据上文续写【下一章】（必须达到 1500 字以上！充分展开剧情和细节）。\\n【前情提要】\\n${context}\\n`;"""

if old_prompt in content:
    content = content.replace(old_prompt, new_prompt)

with open('js/app_novel.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Novel generation updated successfully.")

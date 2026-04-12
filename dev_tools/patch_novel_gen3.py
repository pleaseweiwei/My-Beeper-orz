import re

with open('js/app_novel.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Find doGenerateNovel and the following block end.
# A safe way is to find doGenerateNovel and replace everything until we see the "COMMUNITY AI" separator.
start_match = re.search(r'^\s*async function doGenerateNovel\(\)\s*\{', content, re.MULTILINE)
end_match = re.search(r'// ─── COMMUNITY AI', content)

if start_match and end_match:
    start_idx = start_match.start()
    end_idx = end_match.start()
    
    new_func = """async function doGenerateNovel() {
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
    var genreInput = document.getElementById('novel-custom-genre');
    var customGenre = genreInput && genreInput.value.trim() ? genreInput.value.trim() : null;
    var genre = customGenre || (GENRES.find(function(g) { return g.id === state.generationGenre; }) || { label: '言情' }).label;
    
    var setProgress = function(msg) {
      state.genProgress = msg;
      if (btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + msg;
    };

    var booksToGen = state.booksToGenerate || 1;
    setProgress('开始构思 ' + booksToGen + ' 本小说...');

    // We can run generations in parallel to make it faster
    var genPromises = [];
    
    for (let i = 0; i < booksToGen; i++) {
        genPromises.push((async () => {
            // 1. 生成设定集
            let settingPrompt = `请为一部【${genre}】题材的小说生成一份《剧组设定集》。\\n`+
                                `结合要素：${tropeStr}\\n`+
                                `参演AI角色：\\n${charaPersonas}\\n\\n`+
                                `请直接输出设定集，包含：1. 暂定书名（加书名号，不同批次风格要迥异）；2. 一句话世界观；3. 每个角色在剧中的新身份及性格微调。`;
            
            var settingResult = await callAPI(settingPrompt, 800);
            if (!settingResult) throw new Error('设定集推演失败');
            
            var titleMatch = settingResult.match(/《(.+?)》/);
            var title = titleMatch ? titleMatch[1] : ('时空异卷_' + Date.now().toString().slice(-4) + '_' + i);
            
            // 2. 正式撰写第一章 (序章)
            var prompt1 = buildTavernPrompt(title, genre, tropeStr, charaPersonas, userPersona, worldContent, "《剧本设定集参考》\\n" + settingResult, true);
            var result1 = await callAPI(prompt1, 4000); // Increased max_tokens

            if (!result1) throw new Error('正文生成失败');
            
            var content1 = result1.replace(/《.+?》/, '').trim();

            var newBook = {
              id: 'gen_' + Date.now() + '_' + i,
              title: title,
              tags: customGenre ? ['all'] : [state.generationGenre],
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
            return newBook;
        })());
    }

    try {
        var newBooks = await Promise.all(genPromises);
        
        newBooks.forEach(b => state.books.push(b));
        saveState();

        state.isGenerating = false;
        state.genProgress = '';
        if (btn) { btn.innerHTML = '<i class="fas fa-magic"></i> 一键生成 ' + booksToGen + ' 本小说'; btn.disabled = false; }
        showNovelToast('✅ 成功生成 ' + newBooks.length + ' 本小说！');
        closeGenPanel();
        
        // Open the first one
        if (newBooks.length > 0) {
            openBook(newBooks[0]);
        }
    } catch(e) {
        state.isGenerating = false;
        state.genProgress = '';
        if (btn) { btn.innerHTML = '<i class="fas fa-magic"></i> 一键生成 ' + booksToGen + ' 本小说'; btn.disabled = false; }
        showNovelToast(e.message || '生成过程中发生错误');
    }
  }

  """
    
    content = content[:start_idx] + new_func + content[end_idx:]
    with open('js/app_novel.js', 'w', encoding='utf-8') as f:
        f.write(content)
    with open('patch3_out.txt', 'w', encoding='utf-8') as f:
        f.write("Patched doGenerateNovel successfully!")
else:
    with open('patch3_out.txt', 'w', encoding='utf-8') as f:
        f.write(f"Could not find boundaries! {start_match} {end_match}")

# Now patch buildTavernPrompt to ask for much longer text
with open('js/app_novel.js', 'r', encoding='utf-8') as f:
    content = f.read()

if "800-1200字" in content:
    content = content.replace("800-1200字", "必须大于2000字，极度详细，包含大量对话、动作和心理描写，切忌简略")
    with open('js/app_novel.js', 'w', encoding='utf-8') as f:
        f.write(content)
    with open('patch3_out.txt', 'a', encoding='utf-8') as f:
        f.write("\nPatched buildTavernPrompt successfully!")
else:
    with open('patch3_out.txt', 'a', encoding='utf-8') as f:
        f.write("\nCould not find 800-1200字 in buildTavernPrompt!")

(function () {
    'use strict';

    // --- 全局变量 ---
    let config = { enabled: true, lang: 'zh-Hans' };
    let dictHans = {};
    let dictHant = {};
    const CACHE_DURATION = 6 * 60 * 60 * 1000; // 6 hours

    // --- 核心功能函数 (已适配 Chrome Extension API) ---
    async function loadDictionary(forceReload = false) {
        const cacheKey = 'mj-trans-dict-cache';
        const storedCache = await chrome.storage.local.get(cacheKey);
        const cache = storedCache[cacheKey] || {};
        const now = Date.now();
        if (!forceReload && cache.timestamp && now - cache.timestamp < CACHE_DURATION) {
            dictHans = cache.dictHans || {};
            dictHant = cache.dictHant || {};
            console.log("Midjourney-Translate: Dictionary loaded from cache.");
            return;
        }
        try {
            console.log("Midjourney-Translate: Fetching new dictionary from CDN...");
            const resHansPromise = fetch('https://cdn.jsdelivr.net/gh/cwser/midjourney-chinese-plugin@main/lang/zh-CN.json').then(res => res.json());
            const resHantPromise = fetch('https://cdn.jsdelivr.net/gh/cwser/midjourney-chinese-plugin@main/lang/zh-TW.json').then(res => res.json());
            const [resHans, resHant] = await Promise.all([resHansPromise, resHantPromise]);
            dictHans = resHans;
            dictHant = resHant;
            await chrome.storage.local.set({ [cacheKey]: { timestamp: now, dictHans, dictHant } });
            console.log("Midjourney-Translate: Dictionary fetched and cached.");
        } catch (error) {
            console.error('Midjourney-Translate: Failed to load dictionary:', error);
        }
    }
    function getDict() { return config.lang === 'zh-Hant' ? dictHant : dictHans; }

    function normalizeKey(text) {
        return text
            .replace(/[\t\n\r]+/g, ' ')
            .replace(/\s+/g, ' ')
            .replace(/[:\uFF1A]$/, '')
            .trim();
    }

    function translateText(text) {
        const dict = getDict();
        const cleaned = text.trim();
        const normalized = normalizeKey(cleaned);
        const lower = normalized.toLowerCase();
        return (
            dict[cleaned] ||
            dict[normalized] ||
            dict[lower] ||
            text
        );
    }
    function processNode(node) {
        if (!config.enabled || !node || !document.body.contains(node)) return;
        if (node.nodeType === 1 && ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(node.tagName)) return;
        const translateAttributes = (el) => {
            const dict = getDict();
            ['title', 'aria-label', 'alt', 'placeholder', 'value'].forEach(attr => {
                const val = el.getAttribute(attr);
                if (val) {
                    const translated = translateText(val);
                    if (translated && translated !== val) {
                        el.setAttribute(attr, translated);
                        el.dataset.translatedAttr = 'true';
                    }
                }
            });
        };
        if (node.nodeType === 3) { const translated = translateText(node.textContent); if (translated && translated !== node.textContent) { node.textContent = translated; } }
        else if (node.nodeType === 1 && !node.dataset.translated) {
            translateAttributes(node);
            if (node.childNodes.length === 1 && node.firstChild.nodeType === 3) {
                const originalText = node.textContent; const translated = translateText(originalText);
                if (translated && translated !== originalText) { node.textContent = translated; node.dataset.translated = 'true'; }
            } else { Array.from(node.childNodes).forEach(child => processNode(child)); }
        }
    }
    function translateAll() { if (!config.enabled) return; processNode(document.body); }
    const observer = new MutationObserver(mutations => {
        mutations.forEach(m => {
            m.addedNodes.forEach(n => processNode(n));
            if (m.type === 'characterData' || m.type === 'attributes') { processNode(m.target); }
        });
    });
    function initObserver() {
        const options = {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: ['title', 'aria-label', 'alt', 'placeholder', 'value']
        };
        if (!document.body) {
            window.addEventListener('DOMContentLoaded', () => {
                observer.observe(document.body, options);
            });
        } else {
            observer.observe(document.body, options);
        }
    }


    // --- 控制面板 ---
    function createControlPanel() {
        const fontLink = document.createElement('link');
        fontLink.rel = 'stylesheet';
        fontLink.href = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0';
        document.head.appendChild(fontLink);

        const styleEl = document.createElement('style');
        styleEl.textContent = `
            /* M3 风格的颜色和变量定义 (亮色主题) */
            :root {
                --m3-primary: #0b57d0;
                --m3-on-primary: #ffffff;
                --m3-surface-2: #f0f2f5;
                --m3-on-surface: #1f1f1f;
                --m3-on-surface-variant: #444746;
                --m3-outline: #c2c6ce;
                --m3-error: #b3261e;
                --m3-on-error: #ffffff;
            }

            /* 悬浮操作按钮 (FAB) - 恢复为原始样式 */
            #mj-trans-btn {
                position: fixed; bottom: 20px; right: 20px; z-index: 9999;
                width: 56px; height: 56px;
                background-color: #a8c7fa; /* 原始浅蓝色 */
                color: #112f5a;             /* 原始深蓝色图标 */
                border-radius: 16px;       /* 原始圆角矩形 */
                display: flex; align-items: center; justify-content: center;
                cursor: pointer;
                box-shadow: 0px 4px 8px 3px rgba(0,0,0,0.15), 0px 1px 3px 0px rgba(0,0,0,0.3);
                transition: all 0.2s ease-out;
                -webkit-user-select: none;
                -moz-user-select: none;
                -ms-user-select: none;
                user-select: none;
            }
            #mj-trans-btn:hover {
                box-shadow: 0px 6px 10px 4px rgba(0,0,0,0.15), 0px 2px 3px 0px rgba(0,0,0,0.3);
            }

            /* M3 风格的面板 (Surface) - 保持亮色主题 */
            #mj-trans-panel {
                position: fixed; bottom: 88px; right: 20px; z-index: 9998;
                background-color: var(--m3-surface-2);
                color: var(--m3-on-surface);
                padding: 16px;
                border-radius: 16px;
                box-shadow: 0px 4px 8px 3px rgba(0,0,0,0.15), 0px 1px 3px 0px rgba(0,0,0,0.3);
                border: 1px solid var(--m3-outline);
                display: none;
                flex-direction: column;
                font-size: 14px;
                gap: 16px;
                min-width: 220px;
                font-family: 'Roboto', sans-serif;
                -webkit-user-select: none;
                -moz-user-select: none;
                -ms-user-select: none;
                user-select: none;
            }

            /* 面板内元素的样式 */
            #mj-trans-panel label {
                display: flex;
                align-items: center;
                cursor: pointer;
                color: var(--m3-on-surface-variant);
            }
            #mj-trans-panel input[type="radio"], #mj-trans-panel input[type="checkbox"] {
                accent-color: var(--m3-primary);
                margin-right: 12px;
            }
            #mj-trans-panel .mj-panel-title {
                font-size: 16px;
                font-weight: 500;
                color: var(--m3-on-surface);
            }
            #mj-trans-panel hr {
                border: none; 
                height: 1px; 
                background-color: var(--m3-outline); 
                opacity: 0.8; 
                margin: -8px 0;
            }
            #mj-clear-cache {
                margin-top: 8px;
                padding: 10px 16px;
                background-color: transparent;
                color: var(--m3-error);
                border: 1px solid var(--m3-error);
                border-radius: 20px;
                cursor: pointer;
                text-align: center;
                transition: background-color 0.2s;
            }
            #mj-clear-cache:hover {
                background-color: rgba(179, 38, 30, 0.08);
            }
        `;
        document.head.appendChild(styleEl);

        const btn = document.createElement('div');
        btn.id = 'mj-trans-btn';
        btn.innerHTML = `<span class="material-symbols-outlined">translate</span>`;

        const panel = document.createElement('div');
        panel.id = 'mj-trans-panel';
        panel.innerHTML = `
          <div class="mj-panel-title">翻译设置</div>
          <label><input type="checkbox" id="mj-enable"> 启用翻译</label>
          <hr>
          <label><input type="radio" name="mj-lang" value="zh-Hans"> 简体中文</label>
          <label><input type="radio" name="mj-lang" value="zh-Hant"> 繁體中文</label>
          <button id="mj-clear-cache">清除缓存并刷新</button>`;

        document.body.appendChild(btn);
        document.body.appendChild(panel);

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
        });
        document.addEventListener('click', (e) => {
            if (!panel.contains(e.target) && !btn.contains(e.target)) { panel.style.display = 'none'; }
        });

        document.getElementById('mj-clear-cache').addEventListener('click', async () => {
            await chrome.storage.local.remove('mj-trans-dict-cache');
            alert('缓存已清除，页面将刷新以重新加载词典。');
            location.reload();
        });

        const enableCheckbox = document.getElementById('mj-enable');
        enableCheckbox.checked = config.enabled;
        enableCheckbox.addEventListener('change', async (e) => {
            config.enabled = e.target.checked;
            await chrome.storage.local.set({ 'mj-trans-config': config });
            location.reload();
        });

        const langRadios = document.querySelectorAll('input[name="mj-lang"]');
        langRadios.forEach(radio => {
            if (radio.value === config.lang) radio.checked = true;
            radio.addEventListener('change', async (e) => {
                if (e.target.checked) {
                    config.lang = e.target.value;
                    await chrome.storage.local.set({ 'mj-trans-config': config });
                    location.reload();
                }
            });
        });
    }

    async function main() {
        const defaultConfig = { enabled: true, lang: 'zh-Hans' };
        const storedData = await chrome.storage.local.get('mj-trans-config');
        config = storedData['mj-trans-config'] || defaultConfig;
        await new Promise(resolve => {
            if (document.body) return resolve();
            const domObserver = new MutationObserver(() => {
                if (document.body) {
                    domObserver.disconnect();
                    resolve();
                }
            });
            domObserver.observe(document.documentElement, { childList: true });
        });
        await loadDictionary();
        createControlPanel();
        if (config.enabled) {
            translateAll();
            initObserver();
        }
    }

    main().catch(console.error);
})();

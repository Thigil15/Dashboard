        // URL da API
        const API_URL = "https://script.google.com/macros/s/AKfycbzfSL1on5MqPhoLdrgiQJFFHfMbK-UDjX_lKd8H09uk-Nxt-S1Shf-CLTm9_5GkhEAi/exec";

        function toPascalCaseKey(key = "") {
            const raw = String(key || "").trim();
            if (!raw) return "";
            const pascalLike = /^[A-Z][A-Za-z0-9]*$/.test(raw) && raw !== raw.toUpperCase();
            if (pascalLike) return raw;
            const sanitized = raw
                .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
                .replace(/[^A-Za-z0-9]+/g, "_")
                .replace(/_{2,}/g, "_")
                .replace(/^_+|_+$/g, "");
            if (!sanitized) return raw;
            const parts = sanitized.split("_").filter(Boolean);
            if (!parts.length) return raw;
            return parts.map((part, idx) => {
                const lower = part.toLowerCase();
                if (idx > 0 && lower.length <= 3) return lower.toUpperCase();
                if (lower.length <= 3 && /^[A-Z0-9]+$/.test(part)) return part;
                if (lower.length <= 3) return lower.toUpperCase();
                return lower.charAt(0).toUpperCase() + lower.slice(1);
            }).join("");
        }

        function addKeyVariants(target, key, value) {
            if (!key) return;
            if (!(key in target)) target[key] = value;
            const pascal = toPascalCaseKey(key);
            if (pascal && !(pascal in target)) target[pascal] = value;
            if (pascal) {
                const camel = pascal.charAt(0).toLowerCase() + pascal.slice(1);
                if (!(camel in target)) target[camel] = value;
                const snake = pascal.replace(/([A-Z])/g, (m, idx) => idx === 0 ? m.toLowerCase() : `_${m.toLowerCase()}`);
                if (!(snake in target)) target[snake] = value;
            }
            const upper = key.toUpperCase();
            if (!(upper in target)) target[upper] = value;
        }

        function pickFirstValue(obj, keys = []) {
            if (!obj || typeof obj !== 'object') return undefined;
            for (const key of keys) {
                if (key in obj) {
                    const value = obj[key];
                    if (value === null || typeof value === 'undefined') continue;
                    if (typeof value === 'string' && value.trim() === '') continue;
                    return value;
                }
            }
            return undefined;
        }

        function deepNormalizeValue(value) {
            if (Array.isArray(value)) {
                return value.map(item => {
                    if (item && typeof item === 'object') {
                        return deepNormalizeObject(item);
                    }
                    return item;
                });
            }
            if (value && typeof value === 'object') {
                return deepNormalizeObject(value);
            }
            return value;
        }

        function deepNormalizeObject(obj) {
            const normalized = {};
            Object.entries(obj || {}).forEach(([key, val]) => {
                const processed = deepNormalizeValue(val);
                addKeyVariants(normalized, key, processed);
            });
            return normalized;
        }

        function normalizeSheetName(name) {
            return String(name || "")
                .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
                .replace(/[^A-Za-z0-9]+/g, "")
                .toLowerCase();
        }

        function parseMaybeJson(value) {
            if (typeof value !== 'string') return value;
            const trimmed = value.trim();
            if (!trimmed) return value;
            if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
                try {
                    return JSON.parse(trimmed);
                } catch (error) {
                    console.warn('[parseMaybeJson] Falha ao fazer parse de JSON potencial:', error);
                }
            }
            return value;
        }

        function normalizeListValue(value) {
            const parsed = parseMaybeJson(value);
            if (Array.isArray(parsed)) {
                return parsed.map(item => typeof item === 'string' ? item.trim() : item).filter(Boolean);
            }
            if (typeof parsed === 'string') {
                return parsed.split(/[;,|]+/).map(s => s.trim()).filter(Boolean);
            }
            return [];
        }

        function coerceSheetRows(sheetData) {
            if (!sheetData) return [];
            if (Array.isArray(sheetData)) return sheetData;
            if (Array.isArray(sheetData.rows)) return sheetData.rows;
            if (Array.isArray(sheetData.registros)) return sheetData.registros;
            if (Array.isArray(sheetData.data)) return sheetData.data;
            if (typeof sheetData === 'object') {
                const values = Object.values(sheetData);
                if (values.every(item => item && typeof item === 'object')) {
                    return values;
                }
            }
            return [];
        }

        function coerceEscalas(source) {
            if (!source) return {};
            const result = {};
            const handleEntry = (entry, fallbackName) => {
                if (!entry || typeof entry !== 'object') return;
                const normalizedEntry = deepNormalizeObject(entry);
                let nomeEscala = normalizedEntry.nomeEscala || normalizedEntry.NomeEscala || normalizedEntry.escala || normalizedEntry.nome || fallbackName;
                if (!nomeEscala) nomeEscala = fallbackName;
                const copy = { ...normalizedEntry, nomeEscala };
                copy.headersDay = normalizeListValue(copy.headersDay || copy.HeadersDay || copy.headers || copy.dias || copy.diasSemana);
                copy.alunos = parseMaybeJson(copy.alunos || copy.Alunos);
                if (Array.isArray(copy.alunos)) {
                    copy.alunos = copy.alunos.map(item => item && typeof item === 'object' ? deepNormalizeObject(item) : item);
                } else {
                    copy.alunos = [];
                }
                result[nomeEscala] = copy;
            };
            if (Array.isArray(source)) {
                source.forEach((entry, index) => handleEntry(entry, `Escala${index + 1}`));
            } else if (typeof source === 'object') {
                Object.entries(source).forEach(([key, value]) => handleEntry(value, key));
            }
            return result;
        }

        function aggregateEscalaSheets(normalizedSheets) {
            const result = {};
            if (!normalizedSheets || typeof normalizedSheets !== 'object') {
                return result;
            }

            const escalaEntries = Object.entries(normalizedSheets)
                .filter(([sheetName]) => /^escala\d+$/.test(normalizeSheetName(sheetName)))
                .sort(([nameA], [nameB]) => {
                    const numA = parseInt((nameA.match(/(\d+)/) || [])[1], 10) || 0;
                    const numB = parseInt((nameB.match(/(\d+)/) || [])[1], 10) || 0;
                    return numA - numB;
                });

            escalaEntries.forEach(([sheetName, sheetValue]) => {
                const rows = coerceSheetRows(sheetValue)
                    .map(row => (row && typeof row === 'object') ? deepNormalizeObject(row) : row)
                    .filter(row => row && typeof row === 'object');

                if (!rows.length) return;

                const dayKeyRegex = /^(\d{1,2})_(\d{2})$/;
                const dayKeyMap = new Map();
                const firstRowKeys = Object.keys(rows[0]);

                firstRowKeys.forEach((key) => {
                    const match = key.match(dayKeyRegex);
                    if (!match) return;
                    const day = match[1].padStart(2, '0');
                    const month = match[2].padStart(2, '0');
                    const pretty = `${day}/${month}`;
                    if (!dayKeyMap.has(key)) {
                        dayKeyMap.set(key, pretty);
                    }
                });

                const headersDay = Array.from(new Set(dayKeyMap.values()));
                const alunos = rows.map((row) => {
                    const clone = { ...row };
                    dayKeyMap.forEach((pretty, normalizedKey) => {
                        if (typeof clone[pretty] === 'undefined') {
                            clone[pretty] = row[normalizedKey];
                        }
                    });
                    return clone;
                });

                const match = sheetName.match(/(\d+)/);
                const nomeEscala = match ? `Escala${match[1]}` : sheetName.replace(/\s+/g, '');

                result[nomeEscala] = {
                    nomeEscala,
                    headersDay,
                    alunos
                };
            });

            return result;
        }

        function normalizeAusenciasReposicoes(records) {
            if (!records) return [];
            let list;
            if (Array.isArray(records)) {
                list = records;
            } else if (typeof records === 'object') {
                list = Object.values(records);
            } else {
                return [];
            }
            return list.map((record) => {
                if (!record || typeof record !== 'object') return record;
                const copy = { ...record };
                const ausenciaRaw = pickFirstValue(copy, ['DataAusenciaISO', 'DataDaAusencia', 'Datadaausencia', 'datadaausencia', 'DATADAAUSENCIA', 'DATA_DA_AUSENCIA', 'DataAusencia', 'dataAusencia', 'dataDaAusencia', 'dataausencia']);
                const reposicaoRaw = pickFirstValue(copy, ['DataReposicaoISO', 'DataDaReposicao', 'Datadareposicao', 'datadareposicao', 'DATADAREPOSICAO', 'DATA_DA_REPOSICAO', 'DataReposicao', 'dataReposicao', 'dataDaReposicao', 'datareposicao']);
                const ausenciaISO = normalizeDateInput(ausenciaRaw);
                const reposicaoISO = normalizeDateInput(reposicaoRaw);
                if (ausenciaISO) copy.DataAusenciaISO = ausenciaISO;
                if (reposicaoISO) copy.DataReposicaoISO = reposicaoISO;
                return copy;
            });
        }

        function isPracticeSheetName(normName) {
            if (!normName) return false;
            if (normName.includes('resumo') || normName.includes('template') || normName.includes('config')) return false;
            if (normName.startsWith('np')) return true;
            return normName.includes('pratica') || normName.includes('pratico');
        }

        function buildNotasPraticasMap(sheets) {
            const result = {};
            Object.entries(sheets || {}).forEach(([sheetName, sheetValue]) => {
                const normName = normalizeSheetName(sheetName);
                if (!isPracticeSheetName(normName)) return;
                const rows = coerceSheetRows(sheetValue);
                if (!rows.length) return;
                const sample = rows[0] || {};
                const nome = sample.nomePratica || sample.NomePratica || sample.pratica || sample.Prática || sample.Pratica || sample.Modulo || sample.NomeModulo || sheetName;
                const registros = rows.map(row => row && typeof row === 'object' ? row : { Valor: row });
                result[nome] = { nomePratica: nome, registros };
            });
            return result;
        }

        function transformSheetsPayload(apiResponse) {
            const bySheet = apiResponse && apiResponse.bySheet ? apiResponse.bySheet : {};
            const normalizedSheets = {};
            Object.entries(bySheet).forEach(([sheetName, value]) => {
                normalizedSheets[sheetName] = deepNormalizeValue(value);
            });
            const sheetIndex = {};
            Object.keys(normalizedSheets).forEach((name) => {
                sheetIndex[normalizeSheetName(name)] = name;
            });
            const pickSheet = (candidates = []) => {
                for (const candidate of candidates) {
                    const norm = normalizeSheetName(candidate);
                    if (sheetIndex[norm]) {
                        return normalizedSheets[sheetIndex[norm]];
                    }
                }
                return null;
            };
            const alunos = coerceSheetRows(pickSheet(['Alunos', 'Lista de Alunos', 'Base Alunos'])).map(row => row && typeof row === 'object' ? deepNormalizeObject(row) : row);
            const ausenciasReposicoes = normalizeAusenciasReposicoes(
                coerceSheetRows(pickSheet(['AusenciasReposicoes', 'Ausências e Reposições', 'Faltas']))
                    .map(row => row && typeof row === 'object' ? deepNormalizeObject(row) : row)
            );
            const notasTeoricasRows = coerceSheetRows(pickSheet(['NotasTeoricas', 'Notas Teoricas', 'Notas Teóricas'])).map(row => row && typeof row === 'object' ? deepNormalizeObject(row) : row);
            const escalasAggregated = aggregateEscalaSheets(normalizedSheets);
            const escalasSource = pickSheet(['Escalas', 'EscalasDisponiveis', 'Escalas Alunos']);
            const escalas = Object.keys(escalasAggregated).length ? escalasAggregated : coerceEscalas(escalasSource);
            const pontoRows = coerceSheetRows(pickSheet(['Ponto', 'Registros Ponto', 'Frequencia', 'Frequência'])).map(row => row && typeof row === 'object' ? deepNormalizeObject(row) : row);
            const notasPraticas = buildNotasPraticasMap(normalizedSheets);
            return {
                appData: {
                    alunos,
                    ausenciasReposicoes,
                    notasTeoricas: { registros: notasTeoricasRows },
                    notasPraticas,
                    escalas,
                    pontoRegistros: pontoRows,
                    meta: apiResponse && apiResponse.meta ? apiResponse.meta : null
                },
                rawSheets: normalizedSheets,
                pontoRows,
                meta: apiResponse && apiResponse.meta ? apiResponse.meta : null
            };
        }

        // Estado global da aplicação

const appState = {
    alunos: [],
    alunosMap: new Map(),
    pontoHojeMap: new Map(),
    pontoHojeAliases: new Map(),
    escalas: {},
    ausenciasReposicoes: [],
    notasTeoricas: {},
    notasPraticas: {},
    todayBR: new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
    todayFullBR: new Date().toLocaleDateString('pt-BR'),
    isSidebarCollapsed: false,
    escalaPreview: {
        pdfRawUrl: '',
        pdfViewerUrl: ''
    }
};

const ATRASO_THRESHOLD_MINUTES = 10;
const TOTAL_ESCALADOS = 25;
const pontoState = {
    rawRows: [],
    byDate: new Map(),
    cache: new Map(),
    scalesByDate: new Map(),
    autoScaleByDate: new Map(),
    dates: [],
    selectedDate: '',
    selectedScale: 'all',
    filter: 'all',
    search: '',
    searchRaw: '',
    lastLoadedAt: null,
    isLoading: false
};

// --- Função Helper para Normalização ---
        function normalizeString(str) {
            if (!str) return '';
            return str.trim().toLowerCase()
                       .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        }

        function getInitials(name = '') {
            if (!name) return '—';
            const parts = name.trim().split(/\s+/).filter(Boolean);
            if (parts.length === 0) return '—';
            if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
            return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
        }

        // --- Funções Utilitárias (Loading/Erro) ---
        function showLoading(show) {
            const overlay = document.getElementById('loading-overlay');
            if (show) {
                overlay.style.display = 'flex';
                setTimeout(() => { overlay.style.opacity = '1'; }, 10);
            } else {
                overlay.style.opacity = '0';
                setTimeout(() => { overlay.style.display = 'none'; }, 300); 
            }
        }
        
        function showError(message, isLoginError = false) {
            console.error("ERRO:", message);
            const errorBoxId = isLoginError ? 'login-error' : 'error-message';
            const errorBox = document.getElementById(errorBoxId);
            
            if (!errorBox) { 
                alert(`Erro: ${message}`);
                return;
            }
            
            if (isLoginError) {
                errorBox.textContent = message;
            } else {
                document.getElementById('error-text').textContent = `Erro: ${message}`;
            }
            
            errorBox.style.display = 'block';
            
            if (!isLoginError) {
                setTimeout(() => { errorBox.style.display = 'none'; }, 10000); 
                showLoading(false); 
            }
        }
        
        // --- Gerenciador de Views Centralizado ---
        function showView(viewIdToShow) {
            console.log(`[showView] Tentando mostrar view: ${viewIdToShow}`);
            const allViewIds = ['login-view', 'dashboard-view', 'student-detail-view'];
            let found = false;
            
            allViewIds.forEach(id => {
                const view = document.getElementById(id);
                if (view) {
                    let displayStyle = 'none';
                    if (view.id === viewIdToShow) {
                        displayStyle = (id === 'dashboard-view' || id === 'login-view') ? 'flex' : 'block';
                        
                        view.style.animation = 'none';
                        view.offsetHeight;
                        view.style.animation = null; 
                        found = true;
                    }
                    view.style.display = displayStyle;
                }
            });

            if (!found) {
                console.error(`[showView] View com ID "${viewIdToShow}" não encontrada!`);
            }
        }

        // --- INICIALIZAÇÃO E CARGA DE DADOS ---
        async function initDashboard() {
            console.log('[initDashboard] Iniciando Dashboard...');
            try {
                showLoading(true);
                await fetchAllData();
                await initializePontoPanel();

                console.log('[initDashboard] Dados carregados, iniciando renderização inicial...');
                renderStudentList(appState.alunos);
                renderAtAGlance(); // Inclui renderModuleAverages()
                renderRecentAbsences();

                console.log('[initDashboard] Renderização inicial completa.');
                
                switchMainTab('dashboard'); 
                
                document.querySelector('#dashboard-view').style.opacity = '1';
                showLoading(false);
 
                console.log("[initDashboard] Inicialização completa. Live update iniciado.");
            } catch (error) {
                const errorMessage = error.message || "Erro desconhecido";
                showError(`Falha Crítica na Inicialização: ${errorMessage}. Verifique a API e recarregue a página.`);
                showLoading(false);
                showView('login-view');
            }
        }
        
        function setupEventHandlers() {
            console.log('[setupEventHandlers] Configurando listeners...');
            document.getElementById('login-form').addEventListener('submit', handleLogin);
            setupSidebarNavigation();
            document.getElementById('sidebar-toggle').addEventListener('click', toggleSidebar); 
            document.getElementById('back-to-dashboard').addEventListener('click', showAlunosList);
            document.getElementById('search-student').addEventListener('input', filterStudentList);
            setupStudentTabNavigation();

            // [ORION] Event Delegation para os cards de aluno
            document.getElementById('student-list-panel').addEventListener('click', (e) => {
                const card = e.target.closest('.student-card');
                if (card) {
                    const email = card.getAttribute('data-student-email');
                    if (email) {
                        showStudentDetail(email);
                    }
                }
            });

            // Event listener para as sub-abas (delegado ao #tab-notas-p)
            document.getElementById('tab-notas-p').addEventListener('click', (e) => {
                const button = e.target.closest('.subnav-button');
                if (button && !button.classList.contains('active')) {
                    const tabId = button.getAttribute('data-subtab-id');
                    switchStudentSubTab(tabId);
                }
            });

            // [ORION] Event Delegation para botões Gemini (caso existam múltiplos)
            document.getElementById('student-tabs-content').addEventListener('click', (e) => {
                 const button = e.target.closest('.gemini-analysis-button');
                 if(button) {
                    const comment = button.getAttribute('data-comment');
                    handleAnalisarComentario(button, comment);
                 }
            });

            document.getElementById('gemini-modal-close').addEventListener('click', closeGeminiModal);
            document.getElementById('gemini-modal').addEventListener('click', (e) => {
                if (e.target.id === 'gemini-modal') {
                    closeGeminiModal();
                }
            });

            const pontoFilterBar = document.getElementById('ponto-filter-bar');
            if (pontoFilterBar) {
                pontoFilterBar.addEventListener('click', handlePontoFilterClick);
            }

            const pontoSearchInput = document.getElementById('ponto-search-input');
            if (pontoSearchInput) {
                pontoSearchInput.addEventListener('input', handlePontoSearch);
            }

            const pontoDatePicker = document.getElementById('ponto-date-picker');
            if (pontoDatePicker) {
                pontoDatePicker.addEventListener('change', handlePontoDateChange);
            }

            const pontoScaleSelect = document.getElementById('ponto-scale-select');
            if (pontoScaleSelect) {
                pontoScaleSelect.addEventListener('change', handlePontoScaleChange);
            }

            const pontoRefreshButton = document.getElementById('ponto-refresh-button');
            if (pontoRefreshButton) {
                pontoRefreshButton.addEventListener('click', handlePontoRefresh);
            }

            const pontoPrevButton = document.getElementById('ponto-prev-date');
            if (pontoPrevButton) {
                pontoPrevButton.addEventListener('click', handlePontoPrevDate);
            }

            const pontoNextButton = document.getElementById('ponto-next-date');
            if (pontoNextButton) {
                pontoNextButton.addEventListener('click', handlePontoNextDate);
            }

            console.log('[setupEventHandlers] Listeners configurados.');
        }

        document.getElementById("login-form").addEventListener("submit", handleLogin);

        async function handleLogin(event) {
        event.preventDefault();
        console.log("[handleLogin] Tentativa de login...");

        const email = document.getElementById("login-email").value.trim();
        const password = document.getElementById("login-password").value.trim();
        const errorBox = document.getElementById("login-error");

        try {
            const response = await fetch("users.json");
            const users = await response.json();

            const user = users.find(u => u.email === email && u.password === password);

            if (user) {
            console.log("[handleLogin] Login bem-sucedido.");
            errorBox.style.display = "none";

            // chama a mesma lógica do código original
            if (typeof showView === "function") showView("dashboard-view");
            if (typeof initDashboard === "function") initDashboard();

            localStorage.setItem("user", JSON.stringify(user));
            } else {
            console.warn("[handleLogin] Falha no login.");
            showError("Email ou senha inválidos.", true);
            }
        } catch (err) {
            console.error("[handleLogin] Erro ao ler users.json:", err);
            showError("Erro ao carregar dados de login.", true);
        }
        }


        async function fetchAllData() {
            console.log("[fetchAllData] Buscando dados estáticos...");
            try {
                const url = new URL(API_URL);
                url.searchParams.set('mode', 'objects');
                url.searchParams.set('skipBlankRows', 'true');
                url.searchParams.set('pretty', '0');
                url.searchParams.set('action', 'getAll');

                const response = await fetch(url.toString());
                if (!response.ok) {
                    throw new Error(`Rede (getAll): ${response.statusText} (${response.status})`);
                }

                const data = await response.json();

                if (data && data.success === false) {
                    throw new Error(data.error || 'Resposta inválida do backend.');
                }

                let payloadForApp = null;

                if (data && data.success) {
                    appState.apiMode = 'legacy';
                    payloadForApp = data;
                } else if (data && data.ok && data.bySheet) {
                    const transformed = transformSheetsPayload(data);
                    appState.apiMode = 'sheets';
                    appState.rawSheets = transformed.rawSheets || {};
                    appState.sheetMeta = transformed.meta || null;
                    appState.pontoStaticRows = transformed.pontoRows || [];
                    payloadForApp = transformed.appData;
                } else {
                    throw new Error('Formato de resposta desconhecido da API.');
                }

                console.log("[fetchAllData] Dados estáticos recebidos (modo:", appState.apiMode, ")");
                onStaticDataLoaded(payloadForApp);
            } catch (e) {
                console.error("[fetchAllData] Erro detalhado:", e);
                throw new Error(`Falha ao buscar dados estáticos: ${e.message}`);
            }
        }

        function onStaticDataLoaded(data) {
            appState.alunos = data.alunos || [];
            appState.escalas = data.escalas || {};
            appState.ausenciasReposicoes = normalizeAusenciasReposicoes(data.ausenciasReposicoes || []);
            appState.notasTeoricas = data.notasTeoricas || { registros: [] };

            if (Array.isArray(data.pontoRegistros)) {
                appState.pontoStaticRows = data.pontoRegistros.map(row => row && typeof row === 'object' ? deepNormalizeObject(row) : row);
                // Extract and populate all available dates from static ponto data
                extractAndPopulatePontoDates(appState.pontoStaticRows);
            }

            if (data.meta) {
                appState.sheetMeta = data.meta;
            }

            const notasRaw = data.notasPraticas || {};
            const normalized = Array.isArray(notasRaw)
               ? notasRaw.reduce((acc, item, idx) => {
                   const name = item.nomeAba || item.nomePratica || `NotasPraticas${idx + 1}`;
                   acc[name] = { nomePratica: name, registros: item.registros || [] };
                   return acc;
                 }, {})
               : Object.entries(notasRaw).reduce((acc, [key, val]) => {
                   const nome = val && val.nomePratica ? val.nomePratica : key;
                   acc[nome] = { nomePratica: nome, registros: (val && val.registros) || [] };
                   return acc;
                 }, {});

            appState.notasPraticas = normalized;
            console.log("[onStaticDataLoaded] Notas Práticas Normalizadas:", appState.notasPraticas);

            appState.alunosMap.clear();
            appState.alunos.forEach(a => { if(a && a.EmailHC) appState.alunosMap.set(a.EmailHC, a); });
            
            console.log("[onStaticDataLoaded] Dados estáticos processados.");
        }

        function extractAndPopulatePontoDates(pontoRows) {
            if (!Array.isArray(pontoRows) || pontoRows.length === 0) {
                console.log("[extractAndPopulatePontoDates] Nenhum registro de ponto para processar.");
                return;
            }

            const dateSet = new Set();
            const groupedByDate = new Map();
            
            pontoRows.forEach(row => {
                if (!row || typeof row !== 'object') return;
                
                // Try multiple date field variations
                const candidates = [
                    row.DataISO,
                    row.dataISO,
                    row.dataIso,
                    row.dataiso,
                    row.DataIso,
                    row.data,
                    row.Data,
                    row.DATA,
                    row['Data (ISO)'],
                    row['DataISO']
                ];
                
                let isoDate = '';
                for (const candidate of candidates) {
                    const normalized = normalizeDateInput(candidate);
                    if (normalized) {
                        isoDate = normalized;
                        break;
                    }
                }
                
                if (isoDate) {
                    dateSet.add(isoDate);
                    
                    // Group records by date for initial cache population
                    if (!groupedByDate.has(isoDate)) {
                        groupedByDate.set(isoDate, []);
                    }
                    groupedByDate.get(isoDate).push(row);
                    
                    // Also track scales per date
                    const escala = row.Escala || row.escala || '';
                    if (escala) {
                        const existing = pontoState.scalesByDate.get(isoDate) || [];
                        if (!existing.includes(escala)) {
                            pontoState.scalesByDate.set(isoDate, [...existing, escala]);
                        }
                    }
                }
            });

            // Populate pontoState with all dates
            pontoState.dates = Array.from(dateSet).filter(Boolean).sort((a, b) => b.localeCompare(a));
            
            // Pre-populate byDate map with raw data
            groupedByDate.forEach((rows, iso) => {
                const normalized = rows.map(row => normalizePontoRecord(row, iso)).filter(Boolean);
                pontoState.byDate.set(iso, normalized);
                pontoState.cache.set(makePontoCacheKey(iso, 'all'), normalized);
            });

            console.log(`[extractAndPopulatePontoDates] ${pontoState.dates.length} datas encontradas:`, pontoState.dates.slice(0, 5));
            console.log(`[extractAndPopulatePontoDates] ${pontoState.byDate.size} datas populadas no cache.`);
        }

        // --- NAVEGAÇÃO PRINCIPAL ---
        function setupSidebarNavigation() {
            const sidebar = document.querySelector('#app-sidebar nav');
            sidebar.addEventListener('click', (e) => {
                const link = e.target.closest('.sidebar-link');
                if (link) {
                    e.preventDefault();
                    switchMainTab(link.getAttribute('data-tab'));
                }
            });
        }
        
        function toggleSidebar() {
            appState.isSidebarCollapsed = !appState.isSidebarCollapsed;
            console.log(`[toggleSidebar] Colapsada: ${appState.isSidebarCollapsed}`);
            const sidebar = document.getElementById('app-sidebar');
            sidebar.classList.toggle('collapsed', appState.isSidebarCollapsed);
        }
        
        function switchMainTab(tabName) {
            console.log("[switchMainTab] Trocando para aba principal:", tabName);
            document.querySelectorAll('.sidebar-link').forEach(l => l.classList.toggle('active', l.getAttribute('data-tab') === tabName));
            
            const allSubViews = document.querySelectorAll('main > .view-container');
            allSubViews.forEach(view => {
                const isActive = view.id === `content-${tabName}`;
                view.style.display = isActive ? 'block' : 'none';
                if (isActive) {
                    view.style.animation = 'none';
                    view.offsetHeight; 
                    view.style.animation = null; 
                }
            });
            
            window.scrollTo(0, 0);
        }

        // --- CÁLCULOS AUXILIARES ---
        function parseNota(notaStr) {
            if (notaStr === null || notaStr === undefined) return 0;
            const str = String(notaStr).trim();
            if (str === '') return 0;
            const n = parseFloat(str.replace('R$', '').replace(/\s/g, '').replace(',', '.'));
            return isNaN(n) ? 0 : n;
        }

        // [ORION] Helper para centralizar a busca de dados do aluno
        function findDataByStudent(emailNormalizado, alunoNomeNormalizado) {
            // Escalas
            const escalas = Object.values(appState.escalas).map(e => {
                const a = (e.alunos || []).find(x => x && 
                    ((x.EmailHC && normalizeString(x.EmailHC) === emailNormalizado) || 
                     (x.NomeCompleto && normalizeString(x.NomeCompleto) === alunoNomeNormalizado))
                );
                return a ? { nomeEscala: e.nomeEscala, headersDay: e.headersDay, ...a } : null;
            }).filter(Boolean); // Filtra nulos

            // Faltas
            const faltas = appState.ausenciasReposicoes.filter(f => f && 
                ((f.EmailHC && normalizeString(f.EmailHC) === emailNormalizado) || 
                 (f.NomeCompleto && normalizeString(f.NomeCompleto) === alunoNomeNormalizado))
            );

            // Notas Teóricas
            const notasT = (appState.notasTeoricas.registros || []).find(n => n && 
                ((n.EmailHC && normalizeString(n.EmailHC) === emailNormalizado) || 
                 (n.NomeCompleto && normalizeString(n.NomeCompleto) === alunoNomeNormalizado))
            );

            // Notas Práticas
            const notasP = Object.values(appState.notasPraticas).flatMap(p =>
                (p.registros || []).filter(x => x && 
                    ((x.EmailHC && normalizeString(x.EmailHC) === emailNormalizado) || 
                     (x.NomeCompleto && normalizeString(x.NomeCompleto) === alunoNomeNormalizado))
                ).map(i => ({ nomePratica: p.nomePratica, ...i }))
            );

            return { escalas, faltas, notasT, notasP };
        }
        
        function calculateAveragesAndDistribution() {
            const activeStudents = appState.alunos.filter(s => s.Status === 'Ativo');
            const activeStudentMap = new Map();
            activeStudents.forEach(s => {
                if (s.EmailHC) activeStudentMap.set(normalizeString(s.EmailHC), s);
                if (s.NomeCompleto) activeStudentMap.set(normalizeString(s.NomeCompleto), s);
            });

            // --- Teóricas (com filtro R2) ---
            const tSums = {}; const tCounts = {};
            if(appState.notasTeoricas?.registros){
                appState.notasTeoricas.registros.forEach(r => {
                    const rEmailNorm = normalizeString(r.EmailHC);
                    const rNomeNorm = normalizeString(r.NomeCompleto);
                    const student = activeStudentMap.get(rEmailNorm) || activeStudentMap.get(rNomeNorm);

                    if(student && student.Curso !== 'Residência - 2º ano' && student.Curso !== 'Residência  - 2º ano'){
                        Object.keys(r).forEach(k => {
                            if(!['SerialNumber','NomeCompleto','EmailHC','Curso'].includes(k) && k.trim() !== ''){
                                const n = parseNota(r[k]);
                                if(n > 0){
                                    tSums[k] = (tSums[k] || 0) + n;
                                    tCounts[k] = (tCounts[k] || 0) + 1;
                                }
                            }
                        });
                    }
                });
            }
            const tAvgs = {};
            let oTSum = 0; let oTCount = 0;
            Object.keys(tSums).forEach(k => { 
                tAvgs[k] = tCounts[k] > 0 ? tSums[k] / tCounts[k] : 0; 
                if (!k.toUpperCase().includes('MÉDIA')) {
                    oTSum += (tSums[k] || 0);
                    oTCount += (tCounts[k] || 0);
                }
            });
            const oTAvg = oTCount > 0 ? oTSum / oTCount : 0;
            
            // --- Práticas (SEM filtro R2) ---
            const pSums = {}; const pCounts = {};
            let oPSum = 0; let oPCount = 0;
            if(appState.notasPraticas && typeof appState.notasPraticas === 'object'){
                Object.values(appState.notasPraticas).forEach(p => { 
                    const pNome = p.nomePratica;
                    if (!pSums[pNome]) { pSums[pNome] = 0; pCounts[pNome] = 0; }
                    if(p && p.registros){
                        p.registros.forEach(r => {
                             const rEmailNorm = normalizeString(r.EmailHC);
                             const rNomeNorm = normalizeString(r.NomeCompleto);
                             const isActive = activeStudentMap.has(rEmailNorm) || activeStudentMap.has(rNomeNorm);
                            if(r && isActive){
                                const kM = Object.keys(r).find(k => /MÉDIA\s*\(NOTA FINAL\)[:]?/i.test(k)) || null;
                                if(kM){
                                    const n = parseNota(r[kM]);
                                    if(n > 0){
                                        pSums[pNome] += n;
                                        pCounts[pNome]++;
                                        oPSum += n;
                                        oPCount++;
                                    }
                                }
                            }
                        });
                    }
                });
            }
            const pAvgs = {};
            Object.keys(pSums).forEach(k => { pAvgs[k] = pCounts[k] > 0 ? pSums[k] / pCounts[k] : 0; });
            const oPAvg = oPCount > 0 ? oPSum / oPCount : 0;
            
            // --- Distribuição (Todos os ativos) ---
            const cCounts = activeStudents.reduce((acc,s) => { const c = s.Curso || 'Sem Curso'; acc[c] = (acc[c] || 0) + 1; return acc; }, {});
            const tA = activeStudents.length;
            const cDist = Object.entries(cCounts).map(([c,n]) => ({course: c, count: n, percentage: tA > 0 ? (n/tA)*100 : 0})).sort((a,b) => b.count - a.count);

            return {
                overallTheoreticalAvg: oTAvg, 
                theoreticalAverages: tAvgs, 
                overallPracticalAvg: oPAvg, 
                practicalAverages: pAvgs, 
                courseDistribution: cDist
            };
        }

        // --- RENDERIZAÇÃO VIEW PRINCIPAL ---
        function renderAtAGlance() {
            try {
                const tS = appState.alunos.length; 
                const aS = appState.alunos.filter(s => s.Status === 'Ativo').length; 
                const pR = appState.ausenciasReposicoes.filter(f => f && !f.DataReposicaoISO && (f.EmailHC || f.NomeCompleto)).length;
                
                const {
                    overallTheoreticalAvg:oTAvg, 
                    theoreticalAverages:tAvgs, 
                    overallPracticalAvg:oPAvg, 
                    practicalAverages:pAvgs, 
                    courseDistribution:cDist
                } = calculateAveragesAndDistribution();
                
                document.getElementById('kpi-total-students').textContent = tS;
                document.getElementById('kpi-active-students').textContent = aS;
                document.getElementById('kpi-pending-replacements').textContent = pR;
                document.getElementById('kpi-avg-theoretical').textContent = oTAvg > 0 ? oTAvg.toFixed(1) : 'N/A';
                document.getElementById('kpi-avg-practical').textContent = oPAvg > 0 ? oPAvg.toFixed(1) : 'N/A';
                
                renderCourseDistributionChart(cDist);
                renderModuleAverages(tAvgs, pAvgs);
            } catch (e) { console.error("[renderAtAGlance] Erro:", e); showError("Erro ao renderizar visão geral."); }
        }
        
        function renderCourseDistributionChart(distribution) {
             const c=document.getElementById('course-distribution-chart'); if(!distribution||distribution.length===0){c.innerHTML='<p class="text-slate-500 text-sm italic">S/ dados curso.</p>'; return;} 
             const colors=['var(--accent-blue)', 'var(--accent-red)', 'var(--accent-green)', 'var(--accent-yellow)', '#a855f7', '#64748b']; 
             let grad=''; let cum=0; const leg=[]; 
             distribution.forEach((item,i)=>{const clr=colors[i%colors.length]; const s=cum; const e=cum+item.percentage; if(item.percentage>0){grad+=`, ${clr} ${s}% ${e}%`;} cum=e; leg.push(`<li><span class="legend-color-box" style="background-color:${clr};"></span>${item.course} (${item.count})</li>`);}); 
             if(cum<100){grad+=`, #E5E9EF ${cum}% 100%`;} 
             c.innerHTML=`<div class="donut-chart" style="--chart-segments:${grad.substring(1)};"></div><div class="donut-legend"><ul>${leg.join('')}</ul></div>`;
        }
        
        function renderModuleAverages(tAvgs, pAvgs) {
            const container = document.getElementById('module-averages-chart');
            if (!container) return;
            let html = '';
            Object.entries(tAvgs)
                .filter(([key]) => key.toUpperCase().includes('MÉDIA'))
                .sort(([keyA], [keyB]) => keyA.localeCompare(keyB)) 
                .forEach(([key, value]) => {
                    if (value > 0) {
                        html += `
                        <div class="radial-card-small">
                            <div class="radial-progress-small" style="--value:${value * 10}; --progress-color: var(--accent-orange);">
                                <span class="radial-progress-small-value" style="color: var(--accent-orange);">${value.toFixed(1)}</span>
                            </div>
                            <div>
                                <span class="radial-label">${key}</span>
                                <span class="block text-xs text-slate-500">Média Teórica</span>
                            </div>
                        </div>
                        `;
                    }
                });
            Object.entries(pAvgs)
                .sort(([keyA], [keyB]) => keyA.localeCompare(keyB)) 
                .forEach(([key, value]) => {
                    if (value > 0) {
                        html += `
                        <div class="radial-card-small">
                            <div class="radial-progress-small" style="--value:${value * 10}; --progress-color: var(--accent-blue);">
                                <span class="radial-progress-small-value" style="color: var(--accent-blue);">${value.toFixed(1)}</span>
                            </div>
                            <div>
                                <span class="radial-label">${key}</span>
                                <span class="block text-xs text-slate-500">Média Prática</span>
                            </div>
                        </div>
                        `;
                    }
                });
            if (html === '') {
                container.innerHTML = '<p class="text-slate-500 text-sm italic col-span-full">Nenhuma média de módulo calculada para alunos ativos.</p>';
                return;
            }
            container.innerHTML = html;
        }

        function renderRecentAbsences() {
             try {
                 const l=document.getElementById('recent-absences-list');
                 if(!appState.ausenciasReposicoes||appState.ausenciasReposicoes.length===0){
                     l.innerHTML='<li class="text-slate-500 italic p-2">Nenhum registro.</li>';
                     return;
                 } 
                 const sorted=[...appState.ausenciasReposicoes]
                     .filter(f => f.EmailHC || f.NomeCompleto) 
                     .sort((a,b)=>{
                         const dA=a.DataReposicaoISO||a.DataAusenciaISO; 
                         const dB=b.DataReposicaoISO||b.DataAusenciaISO; 
                         if(!dB)return -1; if(!dA)return 1; 
                         return new Date(dB+'T00:00:00')-new Date(dA+'T00:00:00');
                     }); 
                
                 l.innerHTML=sorted.slice(0,5).map(i=>{
                     const al = appState.alunos.find(a => 
                         (i.EmailHC && normalizeString(a.EmailHC) === normalizeString(i.EmailHC)) ||
                         (i.NomeCompleto && normalizeString(a.NomeCompleto) === normalizeString(i.NomeCompleto))
                     );
                     const n = al ? al.NomeCompleto : (i.NomeCompleto || i.EmailHC); 
                     const iP=!i.DataReposicaoISO; 
                     const sB=iP?'<span class="badge badge-yellow ml-2">Pendente</span>':'<span class="badge badge-green ml-2">Reposto</span>'; 
                     const dT=i.DataReposicaoISO||i.DataAusenciaISO; 
                     const fD=dT?new Date(dT+'T00:00:00').toLocaleDateString('pt-BR'):'Data Indef.'; 
                     return `<li class="text-xs"><div class="flex justify-between items-center mb-0.5"><span class="font-semibold text-slate-700 truncate pr-2" title="${n}">${n}</span><span class="text-slate-500 text-[11px] flex-shrink-0">${fD}</span></div><div class="flex justify-between items-center"><span class="text-slate-500 truncate pr-2" title="${i.Motivo||''}">${iP?'Ausência':'Reposição'} (${i.Local||'N/A'})</span>${sB}</div></li>`;
                 }).join('');
             } catch(e) { console.error("[renderRecentAbsences] Erro:", e); showError("Erro ao renderizar registros recentes."); }
        }

        function findActiveScale() {
             for(const n in appState.escalas){const e=appState.escalas[n]; if(e.headersDay?.includes(appState.todayBR))return e;} console.warn(`Nenhuma escala hoje (${appState.todayBR})`); return null;
        }


        function isoToDayMonth(isoDate = '') {
            const iso = normalizeDateInput(isoDate);
            if (!iso) return '';
            const [year, month, day] = iso.split('-');
            if (!year || !month || !day) return '';
            return `${day.padStart(2, '0')}/${month.padStart(2, '0')}`;
        }

        function normalizeHeaderDay(value = '') {
            const str = String(value || '').trim();
            if (!str) return '';
            const parts = str.split(/[\/]/);
            if (parts.length < 2) return '';
            const day = parts[0].padStart(2, '0');
            const month = parts[1].padStart(2, '0');
            return `${day}/${month}`;
        }

        function getRosterForDate(dateIso) {
            const iso = normalizeDateInput(dateIso);
            if (!iso) return [];
            const target = isoToDayMonth(iso);
            if (!target) return [];

            const rosterMap = new Map();
            Object.values(appState.escalas || {}).forEach((escala = {}) => {
                const headers = Array.isArray(escala.headersDay) ? escala.headersDay : [];
                const matchesDate = headers.some((day) => normalizeHeaderDay(day) === target);
                if (!matchesDate) return;

                (escala.alunos || []).forEach((aluno) => {
                    if (!aluno) return;
                    const nomeNorm = normalizeString(aluno.NomeCompleto || aluno.nomeCompleto || aluno.Nome || aluno.nome);
                    const emailNorm = normalizeString(aluno.EmailHC || aluno.Email || aluno.email);
                    const serialRaw = aluno.SerialNumber || aluno.Serial || aluno.ID || aluno.Id || '';
                    const serialNorm = normalizeString(serialRaw ? String(serialRaw) : '');
                    const key = nomeNorm || emailNorm || serialNorm;
                    if (!key || rosterMap.has(key)) return;
                    rosterMap.set(key, {
                        ...aluno,
                        __escalaNome: escala.nomeEscala || escala.nome || '',
                        __headers: headers
                    });
                });
            });

            return Array.from(rosterMap.values());
        }

        function getScaleForDate(dateIso) {
            const iso = normalizeDateInput(dateIso);
            if (!iso) return null;
            const target = isoToDayMonth(iso);
            if (!target) return null;
            const normalizedTarget = normalizeHeaderDay(target);
            return Object.values(appState.escalas || {}).find((escala = {}) => {
                const headers = Array.isArray(escala.headersDay) ? escala.headersDay : [];
                return headers.some((day) => normalizeHeaderDay(day) === normalizedTarget);
            }) || null;
        }

        function buildRosterNormalizedRecords(dateIso, scaleLabel = 'all') {
            const iso = normalizeDateInput(dateIso);
            if (!iso) return { normalizedRecords: [], rosterEntries: [] };

            const roster = getRosterForDate(iso);
            if (!roster.length) return { normalizedRecords: [], rosterEntries: [] };

            const scaleKey = normalizeScaleKey(scaleLabel);
            const normalizedRecords = [];
            const rosterEntries = [];

            roster.forEach((entry) => {
                const escalaNome = entry.Escala || entry.escala || entry.__escalaNome || scaleLabel || '';
                const escalaKey = normalizeScaleKey(escalaNome);
                if (scaleKey !== 'all' && escalaKey !== scaleKey) return;

                const record = normalizePontoRecord({
                    NomeCompleto: entry.NomeCompleto || entry.nomeCompleto || entry.Nome || entry.nome || '',
                    EmailHC: entry.EmailHC || entry.Email || entry.email || '',
                    SerialNumber: entry.SerialNumber || entry.Serial || entry.ID || entry.Id || '',
                    Escala: escalaNome,
                    'Pratica/Teorica': entry['Pratica/Teorica'] || entry['Prática/Teórica'] || entry.Modalidade || entry.modalidade || entry.Tipo || entry.Turno || entry.Periodo || '',
                    DataISO: iso
                }, iso);

                if (record) {
                    if (!record.escala && escalaNome) {
                        record.escala = escalaNome;
                    }
                    rosterEntries.push({
                        ...entry,
                        __escalaNome: escalaNome,
                        __normalizedKeys: {
                            nomeId: record.nomeId,
                            email: record.emailNormalized,
                            serial: record.serialNormalized
                        }
                    });
                    normalizedRecords.push(record);
                }
            });

            return { normalizedRecords, rosterEntries };
        }

        function buildPontoDataset(dateIso, scaleLabel = 'all') {
            const iso = normalizeDateInput(dateIso);
            const scale = scaleLabel || 'all';
            if (!iso) return { rows: [], baseRecords: [], rosterEntries: [], rosterSize: 0 };

            const baseRecords = getPontoRecords(iso, scale) || [];
            const { normalizedRecords, rosterEntries } = buildRosterNormalizedRecords(iso, scale);
            const combined = normalizedRecords.length ? mergeRecordLists(normalizedRecords, baseRecords) : baseRecords.slice();
            const enrichedRows = enrichPontoRows(combined);

            return { rows: enrichedRows, baseRecords, rosterEntries, rosterSize: rosterEntries.length };
        }

        function buildPontoRowLookup(rows = []) {
            const map = new Map();
            rows.forEach((row) => {
                if (!row) return;
                const primary = row.nomeId || row.id || row.emailNormalized || row.serialNormalized || '';
                const keys = new Set([primary, row.nomeId, row.id, row.emailNormalized, row.serialNormalized]);
                collectPontoIdentityAliases(row, primary).forEach((alias) => keys.add(alias));
                keys.forEach((key) => {
                    const normalized = normalizeString(key);
                    if (normalized) {
                        map.set(normalized, row);
                    }
                });
            });
            return map;
        }

        function escapeHtml(value = '') {
            if (value === null || value === undefined) return '';
            return String(value)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        function sanitizeTime(value = '') {
            const trimmed = value.trim();
            if (!trimmed) return '';
            const parts = trimmed.split(':');
            if (parts.length >= 2) {
                return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`;
            }
            return trimmed;
        }

        function toMinutes(time = '') {
            if (!time) return null;
            const parts = time.split(':');
            if (parts.length < 2) return null;
            const hours = parseInt(parts[0], 10);
            const minutes = parseInt(parts[1], 10);
            if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
            return hours * 60 + minutes;
        }

        function formatDateBR(isoDate = '') {
            if (!isoDate) return '--';
            const [year, month, day] = isoDate.split('-');
            if (!year || !month || !day) return isoDate;
            return `${day}/${month}/${year}`;
        }

        function formatDateLabel(isoDate = '') {
            if (!isoDate) return '--';
            try {
                const date = new Date(`${isoDate}T00:00:00`);
                return date.toLocaleDateString('pt-BR', {
                    weekday: 'long',
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric'
                });
            } catch (error) {
                return formatDateBR(isoDate);
            }
        }

        function convertDateBRToISO(value = '') {
            const sanitized = String(value || '').trim();
            if (!sanitized) return '';
            if (/^\d{4}-\d{2}-\d{2}$/.test(sanitized)) {
                return sanitized;
            }
            const parts = sanitized.split(/[\/-]/);
            if (parts.length !== 3) return '';
            const [day, month, year] = parts;
            if (!day || !month || !year) return '';
            return `${year.padStart(4, '0')}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        }

        function normalizeDateInput(value) {
            if (value instanceof Date && !Number.isNaN(value.getTime())) {
                return value.toISOString().slice(0, 10);
            }
            const str = String(value || '').trim();
            if (!str) return '';
            if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
            if (/^\d{2}[\/-]\d{2}[\/-]\d{4}$/.test(str)) return convertDateBRToISO(str);
            return '';
        }

        function parseAvailableDates(raw) {
            if (!raw) return [];
            let values;
            if (Array.isArray(raw)) {
                values = raw;
            } else if (typeof raw === 'string') {
                values = raw.split(/[;,\s]+/).filter(Boolean);
            } else if (typeof raw === 'object') {
                values = Object.keys(raw);
            } else {
                values = [];
            }
            const isoDates = values
                .map((value) => normalizeDateInput(value))
                .filter(Boolean);
            return Array.from(new Set(isoDates));
        }

        function parseAvailableScales(raw, fallbackDate) {
            const map = new Map();
            if (!raw) return map;

            const ensureList = (value) => {
                if (!value) return [];
                if (Array.isArray(value)) return value;
                if (typeof value === 'object') return Object.values(value);
                return [value];
            };

            if (Array.isArray(raw) || typeof raw === 'string') {
                const iso = normalizeDateInput(fallbackDate);
                if (iso) {
                    const sanitized = ensureList(raw)
                        .map((item) => (item == null ? '' : String(item).trim()))
                        .filter(Boolean);
                    if (sanitized.length) {
                        map.set(iso, Array.from(new Set(sanitized)));
                    }
                }
                return map;
            }

            if (typeof raw === 'object') {
                Object.entries(raw).forEach(([key, value]) => {
                    const iso = normalizeDateInput(key) || normalizeDateInput(fallbackDate);
                    if (!iso) return;
                    const sanitized = ensureList(value)
                        .map((item) => (item == null ? '' : String(item).trim()))
                        .filter(Boolean);
                    if (!sanitized.length) return;
                    const existing = map.get(iso) || [];
                    map.set(iso, Array.from(new Set([...existing, ...sanitized])));
                });
            }

            return map;
        }

        function parseLastUpdated(value) {
            if (!value) return null;
            if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
            const str = String(value).trim();
            if (!str) return null;
            if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
                const iso = str.includes('T') ? str : str.replace(' ', 'T');
                const date = new Date(iso);
                if (!Number.isNaN(date.getTime())) return date;
            }
            const brMatch = str.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})(?:\s+(\d{2}:\d{2}(?::\d{2})?))?/);
            if (brMatch) {
                const [, day, month, year, time = '00:00'] = brMatch;
                const normalizedTime = time.length === 5 ? `${time}:00` : time;
                const date = new Date(`${year}-${month}-${day}T${normalizedTime}`);
                if (!Number.isNaN(date.getTime())) return date;
            }
            const parsed = Date.parse(str);
            return Number.isNaN(parsed) ? null : new Date(parsed);
        }

        function resolvePontoRecords(container) {
            if (!container) return [];
            if (Array.isArray(container)) return container;
            const keys = ['registros', 'records', 'rows', 'lista', 'itens', 'values', 'dados'];
            for (const key of keys) {
                if (Array.isArray(container[key])) {
                    return container[key];
                }
            }
            if (Array.isArray(container.data) && container.data.every((item) => typeof item === 'object')) {
                return container.data;
            }
            if (Array.isArray(container.hoje)) return container.hoje;
            if (container.registrosPorEscala && typeof container.registrosPorEscala === 'object') {
                const aggregated = [];
                Object.values(container.registrosPorEscala).forEach((list) => {
                    if (Array.isArray(list)) aggregated.push(...list);
                });
                if (aggregated.length) return aggregated;
            }
            if (Array.isArray(container.ponto)) return container.ponto;
            return [];
        }

        function extractPontoPayload(response) {
            const root = response || {};
            const container = root.data || root.payload || root.result || root.hoje || root.ponto || root;
            const records = resolvePontoRecords(container);
            const selectedDateRaw = container?.dataISO ?? container?.dataIso ?? container?.DataISO ?? container?.data ?? container?.Data ?? root.dataISO ?? root.data ?? '';
            const selectedScaleRaw = container?.escalaAtual ?? container?.escala ?? container?.Escala ?? container?.escalaSelecionada ?? root.escalaAtual ?? '';
            const availableDates = parseAvailableDates(container?.datasDisponiveis ?? container?.datasISO ?? container?.datas ?? root.datasDisponiveis ?? root.datas);
            const scalesByDate = parseAvailableScales(container?.escalasDisponiveis ?? container?.escalas ?? root.escalasDisponiveis, selectedDateRaw);
            const lastUpdated = parseLastUpdated(container?.lastUpdated ?? container?.ultimaAtualizacao ?? container?.lastSync ?? container?.timestamp ?? root.lastUpdated ?? root.ultimaAtualizacao ?? root.lastSync ?? root.timestamp);

            return {
                records,
                selectedDate: normalizeDateInput(selectedDateRaw),
                selectedScale: typeof selectedScaleRaw === 'string' ? selectedScaleRaw : '',
                availableDates,
                scalesByDate,
                lastUpdated
            };
        }

        function normalizeScaleKey(scale) {
            return (!scale || scale === 'all') ? 'all' : normalizeString(scale);
        }

        function makePontoCacheKey(dateIso, scaleKey) {
            return `${dateIso || 'unknown'}__${scaleKey}`;
        }

        function getPontoRecordKey(row) {
            const datePart = row.isoDate || '';
            const nameKey = row.nomeId || row.id || normalizeString(row.nome || '');
            const serial = row.serialNormalized || normalizeString(row.rawSerial || '');
            const email = row.emailNormalized || (row.email ? normalizeString(row.email) : '');
            const scale = normalizeString(row.escala || '');
            return `${datePart}|${nameKey}|${serial}|${email}|${scale}`;
        }

        function mergeRecordLists(base = [], additions = []) {
            const map = new Map();
            (base || []).forEach((row) => {
                map.set(getPontoRecordKey(row), row);
            });
            (additions || []).forEach((row) => {
                map.set(getPontoRecordKey(row), row);
            });
            return Array.from(map.values());
        }

        function normalizePontoRecord(row = {}, fallbackDate = '') {
            if (!row) return null;
            const nome = row.NomeCompleto || row.Nome || row.nomeCompleto || row.nome || '';
            const candidates = [
                row.DataISO,
                row.dataISO,
                row.dataIso,
                row.dataiso,
                row.DataIso,
                row.data,
                row.Data,
                row.DATA,
                row['Data (ISO)'],
                row['DataISO']
            ];
            let isoDate = '';
            for (const candidate of candidates) {
                const normalized = normalizeDateInput(candidate);
                if (normalized) {
                    isoDate = normalized;
                    break;
                }
            }
            if (!isoDate) {
                isoDate = normalizeDateInput(fallbackDate);
            }
            if (!isoDate) return null;

            const escala = row.Escala || row.escala || row['Escala'] || '';
            const modalidade = row['Pratica/Teorica'] || row['Prática/Teórica'] || row['Pratica/Teórica'] || row['Prática/Teorica'] || row.Modalidade || row.modalidade || '';
            const horaEntradaRaw = (row.HoraEntrada ?? row.Entrada ?? row.horaEntrada ?? '').toString();
            const horaSaidaRaw = (row.HoraSaida ?? row.Saida ?? row.horaSaida ?? '').toString();
            const horaEntrada = sanitizeTime(horaEntradaRaw);
            const horaSaida = sanitizeTime(horaSaidaRaw);
            const rawSerialValue = row.SerialNumber || row.Serial || row.ID || row.Id || '';
            const rawSerial = rawSerialValue !== null && rawSerialValue !== undefined ? String(rawSerialValue) : '';
            const serialNormalized = rawSerial ? normalizeString(rawSerial) : '';
            const emailValue = row.EmailHC || row.Email || row.email || '';
            const email = emailValue || '';
            const emailNormalized = email ? normalizeString(email) : '';
            const nomeId = normalizeString(nome);
            const primaryId = nomeId || serialNormalized || emailNormalized || '';

            return {
                id: primaryId,
                nomeId,
                rawSerial,
                serialNormalized,
                nome,
                isoDate,
                dataBr: formatDateBR(isoDate),
                escala,
                modalidade,
                horaEntrada,
                horaSaida,
                horaEntradaMinutes: toMinutes(horaEntradaRaw || horaEntrada),
                escalaKey: normalizeString(escala || 'sem-escala'),
                email,
                emailNormalized
            };
        }

        function applyPontoData(records = [], {
            targetDate = '',
            scale = 'all',
            availableDates = [],
            scalesByDate = new Map(),
            lastUpdated = null,
            updateSelection = false,
            replaceExisting = false
        } = {}) {
            const normalizedDate = normalizeDateInput(targetDate);
            const scaleLabel = scale || 'all';
            const scaleKey = normalizeScaleKey(scaleLabel);
            const processed = (records || []).map((row) => normalizePontoRecord(row, normalizedDate)).filter(Boolean);
            const grouped = new Map();

            if (!processed.length && normalizedDate) {
                grouped.set(normalizedDate, []);
            }

            processed.forEach((entry) => {
                const iso = entry.isoDate || normalizedDate;
                if (!iso) return;
                if (!grouped.has(iso)) grouped.set(iso, []);
                grouped.get(iso).push(entry);
            });

            grouped.forEach((rows, iso) => {
                const existingAll = pontoState.byDate.get(iso) || [];
                let mergedAll;

                if (replaceExisting) {
                    if (scaleKey === 'all') {
                        mergedAll = rows.slice();
                        pontoState.byDate.set(iso, mergedAll);
                        Array.from(pontoState.cache.keys()).forEach((key) => {
                            if (key.startsWith(`${iso}__`)) {
                                pontoState.cache.delete(key);
                            }
                        });
                    } else {
                        const filteredAll = existingAll.filter((row) => normalizeScaleKey(row.escala || 'sem-escala') !== scaleKey);
                        mergedAll = mergeRecordLists(filteredAll, rows);
                        pontoState.byDate.set(iso, mergedAll);
                        pontoState.cache.delete(makePontoCacheKey(iso, scaleKey));
                    }
                } else {
                    mergedAll = scaleKey === 'all' ? rows.slice() : mergeRecordLists(existingAll, rows);
                    pontoState.byDate.set(iso, mergedAll);
                }

                if (!mergedAll) {
                    mergedAll = scaleKey === 'all' ? rows.slice() : mergeRecordLists(existingAll, rows);
                    pontoState.byDate.set(iso, mergedAll);
                }

                pontoState.cache.set(makePontoCacheKey(iso, 'all'), mergedAll);
                if (scaleKey !== 'all') {
                    pontoState.cache.set(makePontoCacheKey(iso, scaleKey), rows.slice());
                }
            });

            const dateSet = new Set(pontoState.dates);
            (availableDates || []).forEach((dateValue) => {
                const iso = normalizeDateInput(dateValue);
                if (iso) dateSet.add(iso);
            });
            grouped.forEach((_, iso) => {
                if (iso) dateSet.add(iso);
            });
            if (normalizedDate) {
                dateSet.add(normalizedDate);
            }
            pontoState.dates = Array.from(dateSet).filter(Boolean).sort((a, b) => b.localeCompare(a));

            if (!(scalesByDate instanceof Map)) {
                scalesByDate = parseAvailableScales(scalesByDate, normalizedDate);
            }

            scalesByDate.forEach((list, dateKey) => {
                const iso = normalizeDateInput(dateKey);
                if (!iso) return;
                const existing = new Set(pontoState.scalesByDate.get(iso) || []);
                (list || []).forEach((item) => {
                    if (item && typeof item === 'string') existing.add(item);
                });
                pontoState.scalesByDate.set(iso, Array.from(existing).sort((a, b) => a.localeCompare(b, 'pt-BR')));
            });

            grouped.forEach((rows, iso) => {
                const existing = new Set(pontoState.scalesByDate.get(iso) || []);
                rows.forEach((row) => {
                    if (row.escala && row.escala.trim()) existing.add(row.escala);
                });
                if (scaleKey !== 'all' && scaleLabel) {
                    existing.add(scaleLabel);
                }
                pontoState.scalesByDate.set(iso, Array.from(existing).sort((a, b) => a.localeCompare(b, 'pt-BR')));
            });

            pontoState.rawRows = Array.from(pontoState.byDate.values()).flat();
            pontoState.lastLoadedAt = lastUpdated || new Date();

            if (updateSelection) {
                if (normalizedDate) {
                    pontoState.selectedDate = normalizedDate;
                    pontoState.autoScaleByDate.set(normalizedDate, scaleLabel || 'all');
                }
                pontoState.selectedScale = scaleLabel || 'all';
            } else {
                if (!pontoState.selectedDate && normalizedDate) {
                    pontoState.selectedDate = normalizedDate;
                }
                if (normalizedDate && scaleKey !== 'all' && scaleLabel && !pontoState.autoScaleByDate.has(normalizedDate)) {
                    pontoState.autoScaleByDate.set(normalizedDate, scaleLabel);
                }
                if (!pontoState.selectedScale) {
                    pontoState.selectedScale = 'all';
                }
            }

            updatePontoHojeMap();
        }

        function getPontoRecords(date, scale = 'all') {
            const iso = normalizeDateInput(date);
            if (!iso) return [];
            const scaleKey = normalizeScaleKey(scale);
            const cacheKey = makePontoCacheKey(iso, scaleKey);
            if (pontoState.cache.has(cacheKey)) {
                return pontoState.cache.get(cacheKey);
            }
            if (scaleKey === 'all') {
                const base = pontoState.byDate.get(iso) || [];
                pontoState.cache.set(cacheKey, base);
                return base;
            }
            const base = pontoState.byDate.get(iso) || [];
            const filtered = base.filter((row) => normalizeString(row.escala || 'sem-escala') === scaleKey);
            pontoState.cache.set(cacheKey, filtered);
            return filtered;
        }

        function hasCachedPontoData(date, scale = 'all') {
            const iso = normalizeDateInput(date);
            if (!iso) return false;
            const scaleKey = normalizeScaleKey(scale);
            if (scaleKey === 'all') {
                return pontoState.cache.has(makePontoCacheKey(iso, 'all')) || pontoState.byDate.has(iso);
            }
            return pontoState.cache.has(makePontoCacheKey(iso, scaleKey));
        }

        function updatePontoHojeMap() {
            const todayISO = new Date().toISOString().slice(0, 10);
            appState.pontoHojeMap.clear();
            if (!appState.pontoHojeAliases) {
                appState.pontoHojeAliases = new Map();
            } else {
                appState.pontoHojeAliases.clear();
            }

            let todaysRows = getPontoRecords(todayISO, 'all');
            if (!todaysRows.length) {
                const scaleList = pontoState.scalesByDate.get(todayISO) || [];
                todaysRows = scaleList.flatMap((scale) => getPontoRecords(todayISO, scale));
            }

            todaysRows.forEach((row) => {
                const primaryKey = row.nomeId || row.id || row.serialNormalized || row.emailNormalized;
                if (!primaryKey) return;

                const entry = {
                    NomeCompleto: row.nome,
                    NomeID: row.nomeId || '',
                    Email: row.email || '',
                    EmailNormalizado: row.emailNormalized || '',
                    SerialNumber: row.rawSerial || '',
                    SerialNormalizado: row.serialNormalized || '',
                    HoraEntrada: row.horaEntrada,
                    HoraSaida: row.horaSaida,
                    Escala: row.escala,
                    Modalidade: row.modalidade || '',
                    DataISO: row.isoDate
                };

                appState.pontoHojeMap.set(primaryKey, entry);

                const aliasKeys = collectPontoIdentityAliases(row, primaryKey);
                aliasKeys.forEach((aliasKey) => {
                    if (!appState.pontoHojeAliases.has(aliasKey)) {
                        appState.pontoHojeAliases.set(aliasKey, primaryKey);
                    }
                });
            });
        }

        function collectPontoIdentityAliases(row = {}, primaryKey = '') {
            const aliases = new Set();
            const addAlias = (value) => {
                const normalized = normalizeString(value);
                if (!normalized || normalized === primaryKey) return;
                aliases.add(normalized);
            };

            addAlias(row.nomeId || row.nome);
            addAlias(row.email);
            addAlias(row.emailNormalized);
            addAlias(row.rawSerial);
            addAlias(row.serialNormalized);

            return Array.from(aliases);
        }

        function resolvePontoHojeRecordByKey(rawKey) {
            const normalized = normalizeString(rawKey);
            if (!normalized) return null;
            if (appState.pontoHojeMap.has(normalized)) {
                return appState.pontoHojeMap.get(normalized);
            }
            const aliasKey = appState.pontoHojeAliases?.get(normalized);
            if (aliasKey && appState.pontoHojeMap.has(aliasKey)) {
                return appState.pontoHojeMap.get(aliasKey);
            }
            return null;
        }

        function resolvePontoHojeRecordFromIdentity({ normName, normEmail, normSerial } = {}) {
            const keys = [normName, normEmail, normSerial];
            for (const key of keys) {
                const record = resolvePontoHojeRecordByKey(key);
                if (record) return record;
            }
            return null;
        }

        function hydratePontoSelectors() {
            const dateInput = document.getElementById('ponto-date-picker');
            const datalist = document.getElementById('ponto-date-options');
            const searchInput = document.getElementById('ponto-search-input');

            if (searchInput) {
                searchInput.value = pontoState.searchRaw || '';
            }

            if (dateInput) {
                if (pontoState.dates.length > 0) {
                    const sortedDates = [...pontoState.dates].sort((a, b) => a.localeCompare(b));
                    dateInput.min = sortedDates[0];
                    dateInput.max = sortedDates[sortedDates.length - 1];
                }
                if (pontoState.selectedDate) {
                    dateInput.value = pontoState.selectedDate;
                }
            }

            if (datalist) {
                datalist.innerHTML = pontoState.dates
                    .slice()
                    .sort((a, b) => b.localeCompare(a))
                    .map((date) => `<option value="${date}">${formatDateBR(date)}</option>`)
                    .join('');
            }

            document.querySelectorAll('#ponto-filter-bar .escala-pill').forEach((pill) => {
                const filter = pill.getAttribute('data-filter');
                pill.classList.toggle('active', filter === pontoState.filter);
            });

            updatePontoScaleOptions();
            updateDateNavigationButtons();
        }

        function updatePontoScaleOptions() {
            const select = document.getElementById('ponto-scale-select');
            if (!select) return;

            const availableScales = pontoState.scalesByDate.get(pontoState.selectedDate) || [];
            let options = '<option value="all">Todas as escalas</option>';
            availableScales.forEach((scaleName) => {
                const safe = escapeHtml(scaleName);
                options += `<option value="${safe}">${safe}</option>`;
            });

            select.innerHTML = options;
            if (pontoState.selectedScale !== 'all') {
                const normalizedSelected = normalizeString(pontoState.selectedScale);
                const normalizedAvailable = availableScales.map((item) => normalizeString(item));
                if (!normalizedAvailable.includes(normalizedSelected)) {
                    pontoState.selectedScale = 'all';
                }
            }
            select.value = pontoState.selectedScale || 'all';
        }

        function enrichPontoRows(rows = []) {
            const baselineByScale = new Map();
            rows.forEach((row) => {
                if (Number.isFinite(row.horaEntradaMinutes)) {
                    const current = baselineByScale.get(row.escalaKey);
                    baselineByScale.set(row.escalaKey, current === undefined ? row.horaEntradaMinutes : Math.min(current, row.horaEntradaMinutes));
                }
            });

            return rows.map((row) => {
                const baseline = baselineByScale.get(row.escalaKey);
                let status = 'absent';
                let statusLabel = 'Falta';
                let badgeClass = 'badge badge-red';
                let delayMinutes = null;

                if (Number.isFinite(row.horaEntradaMinutes)) {
                    if (baseline !== undefined && baseline !== null) {
                        const diff = Math.max(0, row.horaEntradaMinutes - baseline);
                        delayMinutes = diff;
                        if (diff > ATRASO_THRESHOLD_MINUTES) {
                            status = 'late';
                            statusLabel = diff ? `Atraso (+${diff} min)` : 'Atraso';
                            badgeClass = 'badge badge-yellow';
                        } else {
                            status = 'present';
                            statusLabel = 'Presente';
                            badgeClass = 'badge badge-green';
                        }
                    } else {
                        status = 'present';
                        statusLabel = 'Presente';
                        badgeClass = 'badge badge-green';
                    }
                }

                const searchKey = normalizeString([
                    row.nome,
                    row.escala,
                    row.modalidade,
                    row.horaEntrada,
                    row.horaSaida,
                    row.email,
                    row.rawSerial,
                    statusLabel
                ].filter(Boolean).join(' '));

                return {
                    ...row,
                    status,
                    statusLabel,
                    badgeClass,
                    delayMinutes,
                    searchKey,
                    dataBR: formatDateBR(row.isoDate)
                };
            });
        }

        function refreshPontoView() {
            try {
                const dataset = buildPontoDataset(pontoState.selectedDate, pontoState.selectedScale);
                const enriched = dataset.rows || [];
                const presentCount = enriched.filter((row) => row.status === 'present' || row.status === 'late').length;
                const lateCount = enriched.filter((row) => row.status === 'late').length;
                const absentCount = enriched.filter((row) => row.status === 'absent').length;
                const totalEscalados = Math.max(dataset.rosterSize || 0, enriched.length || 0, TOTAL_ESCALADOS);

                updatePontoSummary({
                    total: totalEscalados,
                    present: presentCount,
                    late: lateCount,
                    absent: absentCount
                });
                updatePontoFilterCounters(enriched);

                const searchTerm = pontoState.search || '';
                const filter = pontoState.filter || 'all';
                const filteredRows = enriched.filter((row) => {
                    let matchesFilter = filter === 'all';
                    if (!matchesFilter) {
                        if (filter === 'present') {
                            matchesFilter = row.status === 'present' || row.status === 'late';
                        } else {
                            matchesFilter = row.status === filter;
                        }
                    }
                    const matchesSearch = !searchTerm || row.searchKey.includes(searchTerm);
                    return matchesFilter && matchesSearch;
                });

                renderPontoTable(filteredRows, enriched.length, (dataset.baseRecords || []).length);
                updatePontoMeta();
                renderEscalaOverview();
            } catch (error) {
                console.error('[refreshPontoView] Erro ao atualizar painel de ponto:', error);
                showError('Erro ao atualizar o painel de ponto.');
            }
        }

        function renderEscalaOverview() {
            const card = document.getElementById('escala-sheet-card');
            const dateLabel = document.getElementById('escala-preview-date');
            const totalEl = document.getElementById('escala-preview-total');
            const presentEl = document.getElementById('escala-preview-present');
            const lateEl = document.getElementById('escala-preview-late');
            const absentEl = document.getElementById('escala-preview-absent');
            const titleEl = document.getElementById('escala-sheet-title');
            const periodEl = document.getElementById('escala-sheet-period');
            const countEl = document.getElementById('escala-sheet-count');
            const openSheetButton = document.getElementById('escala-open-sheet');
            const openPdfButton = document.getElementById('escala-open-pdf');
            const pdfFrame = document.getElementById('escala-pdf-frame');
            const emptyState = document.getElementById('escala-pdf-empty');

            if (!card || !dateLabel || !totalEl || !presentEl || !lateEl || !absentEl || !titleEl || !periodEl || !countEl || !openSheetButton || !openPdfButton || !pdfFrame || !emptyState) {
                return;
            }

            const targetDate = normalizeDateInput(pontoState.selectedDate) || new Date().toISOString().slice(0, 10);
            dateLabel.textContent = formatDateLabel(targetDate);

            const dataset = buildPontoDataset(targetDate, 'all');
            const rows = dataset.rows || [];
            const presentCount = rows.filter((row) => row.status === 'present').length;
            const lateCount = rows.filter((row) => row.status === 'late').length;
            const absentCount = rows.filter((row) => row.status === 'absent').length;
            const totalEscalados = Math.max(dataset.rosterSize || 0, rows.length || 0, TOTAL_ESCALADOS);

            totalEl.textContent = totalEscalados;
            presentEl.textContent = presentCount + lateCount;
            lateEl.textContent = lateCount;
            absentEl.textContent = Math.max(absentCount, totalEscalados - (presentCount + lateCount));

            countEl.textContent = `Escalados: ${totalEscalados}`;

            const scale = getScaleForDate(targetDate) || findActiveScale();
            const scaleName = scale?.nomeExibicao || scale?.nomeEscala || scale?.nome || '';
            titleEl.textContent = scaleName ? `Visualizador de Escala • ${scaleName}` : 'Visualizador de Escala';

            const periodLabel = formatScalePeriodLabel(scale) || (targetDate ? formatDateLabel(targetDate) : '--');
            periodEl.textContent = periodLabel;

            const sheetUrl = resolveEscalaSheetUrl(scale);
            if (sheetUrl) {
                openSheetButton.disabled = false;
                openSheetButton.classList.remove('is-disabled');
                openSheetButton.title = 'Abrir planilha da escala no Google Planilhas';
                openSheetButton.onclick = (event) => {
                    event.stopPropagation();
                    window.open(sheetUrl, '_blank', 'noopener');
                };
                card.classList.add('is-clickable');
                card.onclick = (event) => {
                    const interactive = event.target.closest('button, a, input, select, textarea, label');
                    if (interactive) return;
                    window.open(sheetUrl, '_blank', 'noopener');
                };
                card.onkeydown = (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        window.open(sheetUrl, '_blank', 'noopener');
                    }
                };
                card.setAttribute('role', 'button');
                card.tabIndex = 0;
            } else {
                openSheetButton.disabled = true;
                openSheetButton.classList.add('is-disabled');
                openSheetButton.title = 'Planilha indisponível';
                openSheetButton.onclick = null;
                card.classList.remove('is-clickable');
                card.onclick = null;
                card.onkeydown = null;
                card.removeAttribute('role');
                card.removeAttribute('tabindex');
            }

            const pdfRawUrl = resolveEscalaPdfUrl(scale);
            const viewerUrl = pdfRawUrl ? buildEscalaPdfViewerUrl(pdfRawUrl) : '';
            appState.escalaPreview.pdfRawUrl = pdfRawUrl;

            if (pdfRawUrl) {
                openPdfButton.disabled = false;
                openPdfButton.classList.remove('is-disabled');
                openPdfButton.title = 'Abrir o PDF da escala em uma nova guia';
                openPdfButton.onclick = (event) => {
                    event.stopPropagation();
                    window.open(pdfRawUrl, '_blank', 'noopener');
                };
            } else {
                openPdfButton.disabled = true;
                openPdfButton.classList.add('is-disabled');
                openPdfButton.title = 'PDF não disponível';
                openPdfButton.onclick = null;
            }

            if (viewerUrl) {
                if (appState.escalaPreview.pdfViewerUrl !== viewerUrl) {
                    pdfFrame.src = viewerUrl;
                    appState.escalaPreview.pdfViewerUrl = viewerUrl;
                }
                pdfFrame.hidden = false;
                emptyState.hidden = true;
            } else {
                if (appState.escalaPreview.pdfViewerUrl) {
                    pdfFrame.src = 'about:blank';
                }
                appState.escalaPreview.pdfViewerUrl = '';
                pdfFrame.hidden = true;
                emptyState.hidden = false;
            }
        }

        function resolveEscalaSheetUrl(escala = {}) {
            if (!escala || typeof escala !== 'object') return '';
            const candidates = [
                escala.planilhaUrl,
                escala.planilhaURL,
                escala.planilhaLink,
                escala.sheetUrl,
                escala.sheetURL,
                escala.sheetLink,
                escala.spreadsheetUrl,
                escala.linkPlanilha,
                escala.linkDaPlanilha,
                escala.link,
                escala.urlPlanilha,
                escala.url
            ];
            for (const candidate of candidates) {
                if (typeof candidate === 'string' && candidate.trim()) {
                    return candidate.trim();
                }
            }
            return '';
        }

        function resolveEscalaPdfUrl(escala = {}) {
            if (!escala || typeof escala !== 'object') return '';
            const candidates = [
                escala.pdfUrl,
                escala.pdfURL,
                escala.pdf,
                escala.pdfLink,
                escala.linkPdf,
                escala.linkPDF,
                escala.pdfPreview,
                escala.previewPdf,
                escala.visualizadorPdf,
                escala.pdfViewerUrl,
                escala.documentoPdf,
                escala.arquivoPdf,
                escala.pdfDriveUrl,
                escala.pdf_drive_url,
                escala.pdfDrive
            ];
            for (const candidate of candidates) {
                if (typeof candidate === 'string' && candidate.trim()) {
                    return candidate.trim();
                }
            }
            return '';
        }

        function buildEscalaPdfViewerUrl(url = '') {
            const trimmed = (url || '').trim();
            if (!trimmed) return '';
            if (/drive\.google\.com/i.test(trimmed)) {
                if (trimmed.includes('/preview')) return trimmed;
                const idMatch = trimmed.match(/\/d\/([^/]+)/);
                if (idMatch && idMatch[1]) {
                    return `https://drive.google.com/file/d/${idMatch[1]}/preview`;
                }
                const queryId = trimmed.match(/[?&]id=([^&]+)/);
                if (queryId && queryId[1]) {
                    return `https://drive.google.com/file/d/${queryId[1]}/preview`;
                }
            }
            if (trimmed.toLowerCase().endsWith('.pdf')) {
                return trimmed;
            }
            return `https://docs.google.com/gview?embedded=1&url=${encodeURIComponent(trimmed)}`;
        }

        function formatScalePeriodLabel(escala) {
            if (!escala) return '';
            const rawPeriod = typeof escala.periodo === 'string' ? escala.periodo.trim() : '';
            if (rawPeriod) return rawPeriod;

            const headers = Array.isArray(escala.headersDay) ? escala.headersDay : [];
            const dates = headers
                .map((day) => normalizeHeaderDay(day))
                .filter(Boolean)
                .map((day) => (typeof _esc_parseDMInferYear === 'function' ? _esc_parseDMInferYear(day) : null))
                .filter((date) => date instanceof Date && !Number.isNaN(date.getTime()))
                .sort((a, b) => a - b);

            if (!dates.length) return '';

            const first = dates[0];
            const last = dates[dates.length - 1];
            const firstLabel = first.toLocaleDateString('pt-BR');
            const lastLabel = last.toLocaleDateString('pt-BR');
            return firstLabel === lastLabel
                ? `Dia ${firstLabel}`
                : `Período: ${firstLabel} a ${lastLabel}`;
        }

        

        function updatePontoSummary(counts = {}) {
            const mappings = [
                ['ponto-count-total', counts.total || 0],
                ['ponto-count-present', counts.present || 0],
                ['ponto-count-late', counts.late || 0],
                ['ponto-count-absent', counts.absent || 0]
            ];
            mappings.forEach(([id, value]) => {
                const element = document.getElementById(id);
                if (element) element.textContent = value;
            });
        }

        function updatePontoFilterCounters(rows = []) {
            const counters = {
                'ponto-filter-total': rows.length,
                'ponto-filter-present': rows.filter((row) => row.status === 'present' || row.status === 'late').length,
                'ponto-filter-late': rows.filter((row) => row.status === 'late').length,
                'ponto-filter-absent': rows.filter((row) => row.status === 'absent').length
            };

            Object.entries(counters).forEach(([id, value]) => {
                const element = document.getElementById(id);
                if (element) element.textContent = value;
            });
        }

        function renderPontoTable(rows = [], enrichedCount = 0, totalBase = 0) {
            const tbody = document.getElementById('ponto-table-body');
            const emptyState = document.getElementById('ponto-empty-state');
            if (!tbody || !emptyState) return;

            if (rows.length === 0) {
                tbody.innerHTML = '';
                emptyState.hidden = false;
                const message = emptyState.querySelector('p');
                if (message) {
                    if (totalBase === 0) {
                        message.textContent = pontoState.selectedDate
                            ? `Nenhum registro encontrado para ${formatDateBR(pontoState.selectedDate)}.`
                            : 'Nenhum registro disponível.';
                    } else if (enrichedCount === 0) {
                        message.textContent = 'Nenhum registro disponível para a escala selecionada.';
                    } else {
                        message.textContent = 'Nenhum registro encontrado para os filtros selecionados.';
                    }
                }
                return;
            }

            emptyState.hidden = true;
            tbody.innerHTML = rows.map(renderPontoRow).join('');
        }

        function renderPontoRow(row) {
            const initials = getInitials(row.nome);
            const escalaContent = row.escala && row.escala.trim().length > 0
                ? `<span class="ponto-escala-pill">${escapeHtml(row.escala)}</span>`
                : '<span class="ponto-escala-pill">Sem escala</span>';
            const modalidadeContent = row.modalidade && row.modalidade.trim().length > 0
                ? `<span class="ponto-modalidade">${escapeHtml(row.modalidade)}</span>`
                : '<span class="ponto-modalidade">—</span>';
            const emailLine = row.email ? `<span class="ponto-person-email">${escapeHtml(row.email)}</span>` : '';
            const serialLine = row.rawSerial ? `<span class="ponto-person-extra">Crachá: ${escapeHtml(row.rawSerial)}</span>` : '';

            return `
                <tr class="ponto-row" data-status="${row.status}" data-search="${row.searchKey}">
                    <td data-label="Nome">
                        <div class="ponto-person">
                            <div class="ponto-avatar">${escapeHtml(initials)}</div>
                            <div class="ponto-person-info">
                                <span class="ponto-person-name">${escapeHtml(row.nome || '—')}</span>
                                ${emailLine}
                                ${serialLine}
                            </div>
                        </div>
                    </td>
                    <td data-label="Data">${escapeHtml(row.dataBR)}</td>
                    <td data-label="Hora de Entrada">${escapeHtml(row.horaEntrada || '—')}</td>
                    <td data-label="Hora de Saída">${escapeHtml(row.horaSaida || '—')}</td>
                    <td data-label="Escala">
                        <div class="ponto-escala-cell">
                            ${escalaContent}
                            <span class="${row.badgeClass}">${escapeHtml(row.statusLabel)}</span>
                        </div>
                    </td>
                    <td data-label="Prática/Teórica">${modalidadeContent}</td>
                </tr>`;
        }

        function updatePontoMeta() {
            const dateLabel = document.getElementById('ponto-active-date');
            if (dateLabel) {
                dateLabel.textContent = pontoState.selectedDate ? formatDateLabel(pontoState.selectedDate) : '--';
            }
            const syncLabel = document.getElementById('ponto-last-sync');
            if (syncLabel) {
                syncLabel.textContent = pontoState.lastLoadedAt
                    ? `Atualizado ${pontoState.lastLoadedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
                    : 'Dados não carregados';
            }
        }

        function handlePontoFilterClick(event) {
            const button = event.target.closest('.escala-pill');
            if (!button) return;
            const filter = button.getAttribute('data-filter');
            if (!filter) return;

            pontoState.filter = filter;
            document.querySelectorAll('#ponto-filter-bar .escala-pill').forEach((pill) => {
                pill.classList.toggle('active', pill === button);
            });
            refreshPontoView();
        }

        function handlePontoSearch(event) {
            const value = event.target.value || '';
            pontoState.searchRaw = value;
            pontoState.search = normalizeString(value);
            refreshPontoView();
        }

        async function handlePontoDateChange(event) {
            const isoValue = normalizeDateInput(event.target.value);
            if (!isoValue) return;
            const isSameDate = isoValue === pontoState.selectedDate;
            pontoState.selectedDate = isoValue;
            pontoState.selectedScale = 'all';
            pontoState.filter = 'all';
            pontoState.search = '';
            pontoState.searchRaw = '';
            if (!isSameDate || !hasCachedPontoData(isoValue, 'all')) {
                await ensurePontoData(isoValue, 'all', { showInlineSpinner: true });
            }
            hydratePontoSelectors();
            refreshPontoView();
        }

        async function handlePontoScaleChange(event) {
            const scaleValue = event.target.value || 'all';
            if (scaleValue === pontoState.selectedScale) return;
            pontoState.selectedScale = scaleValue;
            pontoState.filter = 'all';
            const currentDate = pontoState.selectedDate;
            if (currentDate) {
                if (!hasCachedPontoData(currentDate, scaleValue)) {
                    await ensurePontoData(currentDate, scaleValue, { showInlineSpinner: true });
                }
            }
            hydratePontoSelectors();
            refreshPontoView();
        }

        async function handlePontoRefresh() {
            const refreshButton = document.getElementById('ponto-refresh-button');
            if (refreshButton) {
                refreshButton.disabled = true;
                refreshButton.classList.add('is-loading');
                refreshButton.setAttribute('aria-busy', 'true');
            }
            const todayISO = new Date().toISOString().slice(0, 10);
            const dateIso = normalizeDateInput(pontoState.selectedDate) || todayISO;
            const scaleLabel = pontoState.selectedScale || 'all';
            const autoScale = pontoState.autoScaleByDate.get(dateIso);
            const autoScaleKey = autoScale ? normalizeScaleKey(autoScale) : 'all';
            const currentScaleKey = normalizeScaleKey(scaleLabel);
            const useTodayEndpointAll = dateIso === todayISO && (currentScaleKey === 'all' || currentScaleKey === autoScaleKey);

            try {
                await ensurePontoData(dateIso, 'all', {
                    showInlineSpinner: true,
                    useTodayEndpoint: useTodayEndpointAll,
                    forceReload: true,
                    replaceExisting: true
                });

                if (scaleLabel !== 'all') {
                    const useTodayEndpointScale = dateIso === todayISO && currentScaleKey === autoScaleKey;
                    await ensurePontoData(dateIso, scaleLabel, {
                        showInlineSpinner: false,
                        useTodayEndpoint: useTodayEndpointScale,
                        forceReload: true,
                        replaceExisting: true
                    });
                }

                hydratePontoSelectors();
                refreshPontoView();
            } finally {
                if (refreshButton) {
                    refreshButton.disabled = false;
                    refreshButton.classList.remove('is-loading');
                    refreshButton.removeAttribute('aria-busy');
                }
            }
        }

        async function loadPontoData({ date, scale = 'all', showInlineSpinner = false, useTodayEndpoint = false, adoptSelection = false, replaceExisting = false } = {}) {
            const normalizedDate = normalizeDateInput(date);
            const scaleLabel = scale || 'all';
            const scaleKey = normalizeScaleKey(scaleLabel);
            const loadingBanner = document.getElementById('ponto-loading-state');
            if (loadingBanner) {
                loadingBanner.hidden = false;
                loadingBanner.textContent = showInlineSpinner ? 'Atualizando registros do ponto...' : 'Carregando registros do ponto...';
            }

            if (pontoState.isLoading) {
                console.warn('[loadPontoData] Requisição anterior ainda está em andamento.');
            }
            pontoState.isLoading = true;

            try {
                const url = new URL(API_URL);
                if (useTodayEndpoint) {
                    url.searchParams.set('action', 'getPontoHoje_');
                } else {
                    url.searchParams.set('action', 'getPontoPorEscala_');
                    if (normalizedDate) {
                        url.searchParams.set('data', normalizedDate);
                    }
                    if (scaleKey !== 'all') {
                        url.searchParams.set('escala', scaleLabel);
                    }
                }

                const response = await fetch(url.toString());
                if (!response.ok) {
                    throw new Error(`Rede (${url.searchParams.get('action')}): ${response.statusText} (${response.status})`);
                }

                const json = await response.json();
                const payload = extractPontoPayload(json);
                const hasUsefulData = (payload.records && payload.records.length)
                    || (payload.availableDates && payload.availableDates.length)
                    || payload.selectedDate
                    || payload.selectedScale;
                if (json && json.success === false) {
                    if (hasUsefulData) {
                        console.warn('[loadPontoData] Backend retornou success=false, utilizando dados disponíveis mesmo assim.');
                    } else {
                        throw new Error(json.error || 'Resposta inválida do backend.');
                    }
                }

                const resolvedDate = payload.selectedDate || normalizedDate || (payload.availableDates[0] || '');
                const resolvedScale = payload.selectedScale || scaleLabel || 'all';
                const lastUpdated = payload.lastUpdated || new Date();

                applyPontoData(payload.records || [], {
                    targetDate: resolvedDate,
                    scale: resolvedScale,
                    availableDates: payload.availableDates,
                    scalesByDate: payload.scalesByDate,
                    lastUpdated,
                    updateSelection: adoptSelection,
                    replaceExisting
                });

                console.log(`[loadPontoData] Carregados ${(payload.records || []).length} registros (${resolvedScale || 'all'}) para ${resolvedDate || 'sem-data'}.`);

                return { success: true, selectedDate: resolvedDate, selectedScale: resolvedScale };
            } catch (error) {
                console.error('[loadPontoData] Erro ao carregar dados de ponto:', error);
                showError(`Falha ao carregar dados de ponto: ${error.message}`);
                throw error;
            } finally {
                pontoState.isLoading = false;
                if (loadingBanner) {
                    loadingBanner.hidden = true;
                }
            }
        }

        async function ensurePontoData(date, scale = 'all', { showInlineSpinner = false, useTodayEndpoint = false, adoptSelection = false, forceReload = false, replaceExisting = false } = {}) {
            const isoDate = normalizeDateInput(date);
            const scaleLabel = scale || 'all';
            if (!forceReload && isoDate && hasCachedPontoData(isoDate, scaleLabel)) {
                return { success: true, cached: true, selectedDate: isoDate, selectedScale: scaleLabel };
            }
            try {
                if (forceReload && isoDate) {
                    if (scaleLabel === 'all') {
                        pontoState.byDate.delete(isoDate);
                        Array.from(pontoState.cache.keys()).forEach((key) => {
                            if (key.startsWith(`${isoDate}__`)) {
                                pontoState.cache.delete(key);
                            }
                        });
                    } else {
                        pontoState.cache.delete(makePontoCacheKey(isoDate, scaleLabel));
                    }
                }
                return await loadPontoData({
                    date: isoDate,
                    scale: scaleLabel,
                    showInlineSpinner,
                    useTodayEndpoint,
                    adoptSelection,
                    replaceExisting: replaceExisting || forceReload
                });
            } catch (error) {
                console.error('[ensurePontoData] Falha ao garantir dados de ponto:', error);
                return null;
            }
        }

        async function initializePontoPanel() {
            const todayISO = new Date().toISOString().slice(0, 10);
            const result = await ensurePontoData(todayISO, 'all', { useTodayEndpoint: true, adoptSelection: true });
            if (result && result.selectedDate) {
                pontoState.selectedDate = result.selectedDate;
            } else if (!pontoState.selectedDate) {
                pontoState.selectedDate = todayISO;
            }
            if (result && result.selectedScale) {
                pontoState.selectedScale = result.selectedScale;
            } else if (!pontoState.selectedScale) {
                pontoState.selectedScale = 'all';
            }
            if (!pontoState.dates.includes(pontoState.selectedDate)) {
                pontoState.dates.push(pontoState.selectedDate);
                pontoState.dates.sort((a, b) => b.localeCompare(a));
            }
            hydratePontoSelectors();
            refreshPontoView();
        }

        function renderStudentList(students) {
             try {
                 const panel = document.getElementById('student-list-panel'); 
                 if (!panel) return;
                 
                 if (!students || students.length === 0) { panel.innerHTML = '<p class="text-slate-500 p-6 text-center">Nenhum aluno.</p>'; return; } 
                 
                 const grouped = students.reduce((acc, s) => { const c = s.Curso || 'Sem Curso'; if (!acc[c]) acc[c] = []; acc[c].push(s); return acc; }, {}); 
                 const courses = Object.keys(grouped).sort((a, b) => a.localeCompare(b));
                 
                 let html = ''; 
                 courses.forEach(c => { 
                     html += `<div class="student-group" data-course="${c}"><h3 class="student-group-header">${c} (${grouped[c].length})</h3><div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 p-1">`; 
                     
                     grouped[c].sort((a,b) => a.NomeCompleto.localeCompare(b.NomeCompleto)).forEach(s => { 
                         const img = s.FotoID ? `https://lh3.googleusercontent.com/d/${s.FotoID}=s96-c` : 'https://placehold.co/60x60/e2e8f0/64748b?text=?'; 
                         const inactive = s.Status !== 'Ativo'; 
                         const inactiveClass = inactive ? 'inactive-card' : ''; 
                         const inactiveBadge = inactive ? '<span class="badge badge-red inactive-badge">Inativo</span>' : ''; 
                         
                         // [ORION] Removido 'onclick' do HTML.
                         html += `<div class="student-card ${inactiveClass}" data-student-email="${s.EmailHC}" data-student-name="${normalizeString(s.NomeCompleto)}">
                                      ${inactiveBadge}
                                      <img src="${img}" alt="Foto" onerror="this.src='https://placehold.co/60x60/e2e8f0/64748b?text=?'">
                                      <p class="student-name">${s.NomeCompleto}</p>
                                      <p class="student-course mt-0.5">${s.Curso}</p>
                                  </div>`; 
                     }); 
                     html += `</div></div>`; 
                 }); 
                 panel.innerHTML = html;
             } catch (e) { console.error("[renderStudentList] Erro:", e); showError("Erro ao renderizar lista de alunos."); }
        }

        function getRosterForDate(dateIso) {
            const iso = normalizeDateInput(dateIso);
            if (!iso) return [];
            const target = isoToDayMonth(iso);
            if (!target) return [];

            const rosterMap = new Map();
            Object.values(appState.escalas || {}).forEach((escala = {}) => {
                const headers = Array.isArray(escala.headersDay) ? escala.headersDay : [];
                const matchesDate = headers.some((day) => normalizeHeaderDay(day) === target);
                if (!matchesDate) return;

                (escala.alunos || []).forEach((aluno) => {
                    if (!aluno) return;
                    const nomeNorm = normalizeString(aluno.NomeCompleto || aluno.nomeCompleto || aluno.Nome || aluno.nome);
                    const emailNorm = normalizeString(aluno.EmailHC || aluno.Email || aluno.email);
                    const serialRaw = aluno.SerialNumber || aluno.Serial || aluno.ID || aluno.Id || '';
                    const serialNorm = normalizeString(serialRaw ? String(serialRaw) : '');
                    const key = nomeNorm || emailNorm || serialNorm;
                    if (!key || rosterMap.has(key)) return;
                    rosterMap.set(key, {
                        ...aluno,
                        __escalaNome: escala.nomeEscala || escala.nome || '',
                        __headers: headers
                    });
                });
            });

            return Array.from(rosterMap.values());
        }

        function getScaleForDate(dateIso) {
            const iso = normalizeDateInput(dateIso);
            if (!iso) return null;
            const target = isoToDayMonth(iso);
            if (!target) return null;
            const normalizedTarget = normalizeHeaderDay(target);
            return Object.values(appState.escalas || {}).find((escala = {}) => {
                const headers = Array.isArray(escala.headersDay) ? escala.headersDay : [];
                return headers.some((day) => normalizeHeaderDay(day) === normalizedTarget);
            }) || null;
        }

        function buildRosterNormalizedRecords(dateIso, scaleLabel = 'all') {
            const iso = normalizeDateInput(dateIso);
            if (!iso) return { normalizedRecords: [], rosterEntries: [] };

            const roster = getRosterForDate(iso);
            if (!roster.length) return { normalizedRecords: [], rosterEntries: [] };

            const scaleKey = normalizeScaleKey(scaleLabel);
            const normalizedRecords = [];
            const rosterEntries = [];

            roster.forEach((entry) => {
                const escalaNome = entry.Escala || entry.escala || entry.__escalaNome || scaleLabel || '';
                const escalaKey = normalizeScaleKey(escalaNome);
                if (scaleKey !== 'all' && escalaKey !== scaleKey) return;

                const record = normalizePontoRecord({
                    NomeCompleto: entry.NomeCompleto || entry.nomeCompleto || entry.Nome || entry.nome || '',
                    EmailHC: entry.EmailHC || entry.Email || entry.email || '',
                    SerialNumber: entry.SerialNumber || entry.Serial || entry.ID || entry.Id || '',
                    Escala: escalaNome,
                    'Pratica/Teorica': entry['Pratica/Teorica'] || entry['Prática/Teórica'] || entry.Modalidade || entry.modalidade || entry.Tipo || entry.Turno || entry.Periodo || '',
                    DataISO: iso
                }, iso);

                if (record) {
                    if (!record.escala && escalaNome) {
                        record.escala = escalaNome;
                    }
                    rosterEntries.push({
                        ...entry,
                        __escalaNome: escalaNome,
                        __normalizedKeys: {
                            nomeId: record.nomeId,
                            email: record.emailNormalized,
                            serial: record.serialNormalized
                        }
                    });
                    normalizedRecords.push(record);
                }
            });

            return { normalizedRecords, rosterEntries };
        }

        function buildPontoDataset(dateIso, scaleLabel = 'all') {
            const iso = normalizeDateInput(dateIso);
            const scale = scaleLabel || 'all';
            if (!iso) return { rows: [], baseRecords: [], rosterEntries: [], rosterSize: 0 };

            const baseRecords = getPontoRecords(iso, scale) || [];
            const { normalizedRecords, rosterEntries } = buildRosterNormalizedRecords(iso, scale);
            const combined = normalizedRecords.length ? mergeRecordLists(normalizedRecords, baseRecords) : baseRecords.slice();
            const enrichedRows = enrichPontoRows(combined);

            return { rows: enrichedRows, baseRecords, rosterEntries, rosterSize: rosterEntries.length };
        }

        function buildPontoRowLookup(rows = []) {
            const map = new Map();
            rows.forEach((row) => {
                if (!row) return;
                const primary = row.nomeId || row.id || row.emailNormalized || row.serialNormalized || '';
                const keys = new Set([primary, row.nomeId, row.id, row.emailNormalized, row.serialNormalized]);
                collectPontoIdentityAliases(row, primary).forEach((alias) => keys.add(alias));
                keys.forEach((key) => {
                    const normalized = normalizeString(key);
                    if (normalized) {
                        map.set(normalized, row);
                    }
                });
            });
            return map;
        }

        function determineRosterSlot(entry = {}) {
            const turnoRaw = entry.Turno || entry.turno || entry.Periodo || entry['Período'] || entry.periodo || entry.Horario || entry.horario || '';
            const turno = normalizeString(turnoRaw);
            if (turno.includes('noite') || turno.includes('noturno')) return 'night';
            if (turno.includes('tarde') || turno.includes('vespertino')) return 'afternoon';
            if (turno.includes('manha') || turno.includes('manhã') || turno.includes('matutino')) return 'morning';

            const curso = normalizeString(entry.Curso || '');
            if (curso.includes('resid') || curso.includes('bolsa')) return 'morning';
            if (curso.includes('especializa')) return 'afternoon';

            const escalaNome = normalizeString(entry.Escala || entry.escala || entry.__escalaNome || '');
            if (escalaNome.includes('noite') || escalaNome.includes('nt')) return 'night';
            if (escalaNome.includes('tarde')) return 'afternoon';
            if (escalaNome.includes('manha')) return 'morning';

            return 'flex';
        }


        function escapeHtml(value = '') {
            if (value === null || value === undefined) return '';
            return String(value)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        function sanitizeTime(value = '') {
            const trimmed = value.trim();
            if (!trimmed) return '';
            const parts = trimmed.split(':');
            if (parts.length >= 2) {
                return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`;
            }
            return trimmed;
        }

        function toMinutes(time = '') {
            if (!time) return null;
            const parts = time.split(':');
            if (parts.length < 2) return null;
            const hours = parseInt(parts[0], 10);
            const minutes = parseInt(parts[1], 10);
            if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
            return hours * 60 + minutes;
        }

        function formatDateBR(isoDate = '') {
            if (!isoDate) return '--';
            const [year, month, day] = isoDate.split('-');
            if (!year || !month || !day) return isoDate;
            return `${day}/${month}/${year}`;
        }

        function formatDateLabel(isoDate = '') {
            if (!isoDate) return '--';
            try {
                const date = new Date(`${isoDate}T00:00:00`);
                return date.toLocaleDateString('pt-BR', {
                    weekday: 'long',
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric'
                });
            } catch (error) {
                return formatDateBR(isoDate);
            }
        }

        function convertDateBRToISO(value = '') {
            const sanitized = String(value || '').trim();
            if (!sanitized) return '';
            if (/^\d{4}-\d{2}-\d{2}$/.test(sanitized)) {
                return sanitized;
            }
            const parts = sanitized.split(/[\/-]/);
            if (parts.length !== 3) return '';
            const [day, month, year] = parts;
            if (!day || !month || !year) return '';
            return `${year.padStart(4, '0')}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        }

        function normalizeDateInput(value) {
            if (value instanceof Date && !Number.isNaN(value.getTime())) {
                return value.toISOString().slice(0, 10);
            }
            const str = String(value || '').trim();
            if (!str) return '';
            if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
            if (/^\d{2}[\/-]\d{2}[\/-]\d{4}$/.test(str)) return convertDateBRToISO(str);
            return '';
        }

        function parseAvailableDates(raw) {
            if (!raw) return [];
            let values;
            if (Array.isArray(raw)) {
                values = raw;
            } else if (typeof raw === 'string') {
                values = raw.split(/[;,\s]+/).filter(Boolean);
            } else if (typeof raw === 'object') {
                values = Object.keys(raw);
            } else {
                values = [];
            }
            const isoDates = values
                .map((value) => normalizeDateInput(value))
                .filter(Boolean);
            return Array.from(new Set(isoDates));
        }

        function parseAvailableScales(raw, fallbackDate) {
            const map = new Map();
            if (!raw) return map;

            const ensureList = (value) => {
                if (!value) return [];
                if (Array.isArray(value)) return value;
                if (typeof value === 'object') return Object.values(value);
                return [value];
            };

            if (Array.isArray(raw) || typeof raw === 'string') {
                const iso = normalizeDateInput(fallbackDate);
                if (iso) {
                    const sanitized = ensureList(raw)
                        .map((item) => (item == null ? '' : String(item).trim()))
                        .filter(Boolean);
                    if (sanitized.length) {
                        map.set(iso, Array.from(new Set(sanitized)));
                    }
                }
                return map;
            }

            if (typeof raw === 'object') {
                Object.entries(raw).forEach(([key, value]) => {
                    const iso = normalizeDateInput(key) || normalizeDateInput(fallbackDate);
                    if (!iso) return;
                    const sanitized = ensureList(value)
                        .map((item) => (item == null ? '' : String(item).trim()))
                        .filter(Boolean);
                    if (!sanitized.length) return;
                    const existing = map.get(iso) || [];
                    map.set(iso, Array.from(new Set([...existing, ...sanitized])));
                });
            }

            return map;
        }

        function parseLastUpdated(value) {
            if (!value) return null;
            if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
            const str = String(value).trim();
            if (!str) return null;
            if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
                const iso = str.includes('T') ? str : str.replace(' ', 'T');
                const date = new Date(iso);
                if (!Number.isNaN(date.getTime())) return date;
            }
            const brMatch = str.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})(?:\s+(\d{2}:\d{2}(?::\d{2})?))?/);
            if (brMatch) {
                const [, day, month, year, time = '00:00'] = brMatch;
                const normalizedTime = time.length === 5 ? `${time}:00` : time;
                const date = new Date(`${year}-${month}-${day}T${normalizedTime}`);
                if (!Number.isNaN(date.getTime())) return date;
            }
            const parsed = Date.parse(str);
            return Number.isNaN(parsed) ? null : new Date(parsed);
        }

        function resolvePontoRecords(container) {
            if (!container) return [];
            if (Array.isArray(container)) return container;
            const keys = ['registros', 'records', 'rows', 'lista', 'itens', 'values', 'dados'];
            for (const key of keys) {
                if (Array.isArray(container[key])) {
                    return container[key];
                }
            }
            if (Array.isArray(container.data) && container.data.every((item) => typeof item === 'object')) {
                return container.data;
            }
            if (Array.isArray(container.hoje)) return container.hoje;
            if (container.registrosPorEscala && typeof container.registrosPorEscala === 'object') {
                const aggregated = [];
                Object.values(container.registrosPorEscala).forEach((list) => {
                    if (Array.isArray(list)) aggregated.push(...list);
                });
                if (aggregated.length) return aggregated;
            }
            if (Array.isArray(container.ponto)) return container.ponto;
            return [];
        }

        function extractPontoPayload(response) {
            const root = response || {};
            const container = root.data || root.payload || root.result || root.hoje || root.ponto || root;
            const records = resolvePontoRecords(container);
            const selectedDateRaw = container?.dataISO ?? container?.dataIso ?? container?.DataISO ?? container?.data ?? container?.Data ?? root.dataISO ?? root.data ?? '';
            const selectedScaleRaw = container?.escalaAtual ?? container?.escala ?? container?.Escala ?? container?.escalaSelecionada ?? root.escalaAtual ?? '';
            const availableDates = parseAvailableDates(container?.datasDisponiveis ?? container?.datasISO ?? container?.datas ?? root.datasDisponiveis ?? root.datas);
            const scalesByDate = parseAvailableScales(container?.escalasDisponiveis ?? container?.escalas ?? root.escalasDisponiveis, selectedDateRaw);
            const lastUpdated = parseLastUpdated(container?.lastUpdated ?? container?.ultimaAtualizacao ?? container?.lastSync ?? container?.timestamp ?? root.lastUpdated ?? root.ultimaAtualizacao ?? root.lastSync ?? root.timestamp);

            return {
                records,
                selectedDate: normalizeDateInput(selectedDateRaw),
                selectedScale: typeof selectedScaleRaw === 'string' ? selectedScaleRaw : '',
                availableDates,
                scalesByDate,
                lastUpdated
            };
        }

        function normalizeScaleKey(scale) {
            return (!scale || scale === 'all') ? 'all' : normalizeString(scale);
        }

        function makePontoCacheKey(dateIso, scaleKey) {
            return `${dateIso || 'unknown'}__${scaleKey}`;
        }

        function getPontoRecordKey(row) {
            const datePart = row.isoDate || '';
            const nameKey = row.nomeId || row.id || normalizeString(row.nome || '');
            const serial = row.serialNormalized || normalizeString(row.rawSerial || '');
            const email = row.emailNormalized || (row.email ? normalizeString(row.email) : '');
            const scale = normalizeString(row.escala || '');
            return `${datePart}|${nameKey}|${serial}|${email}|${scale}`;
        }

        function mergeRecordLists(base = [], additions = []) {
            const map = new Map();
            (base || []).forEach((row) => {
                map.set(getPontoRecordKey(row), row);
            });
            (additions || []).forEach((row) => {
                map.set(getPontoRecordKey(row), row);
            });
            return Array.from(map.values());
        }

        function normalizePontoRecord(row = {}, fallbackDate = '') {
            if (!row) return null;
            const nome = row.NomeCompleto || row.Nome || row.nomeCompleto || row.nome || '';
            const candidates = [
                row.DataISO,
                row.dataISO,
                row.dataIso,
                row.dataiso,
                row.DataIso,
                row.data,
                row.Data,
                row.DATA,
                row['Data (ISO)'],
                row['DataISO']
            ];
            let isoDate = '';
            for (const candidate of candidates) {
                const normalized = normalizeDateInput(candidate);
                if (normalized) {
                    isoDate = normalized;
                    break;
                }
            }
            if (!isoDate) {
                isoDate = normalizeDateInput(fallbackDate);
            }
            if (!isoDate) return null;

            const escala = row.Escala || row.escala || row['Escala'] || '';
            const modalidade = row['Pratica/Teorica'] || row['Prática/Teórica'] || row['Pratica/Teórica'] || row['Prática/Teorica'] || row.Modalidade || row.modalidade || '';
            const horaEntradaRaw = (row.HoraEntrada ?? row.Entrada ?? row.horaEntrada ?? '').toString();
            const horaSaidaRaw = (row.HoraSaida ?? row.Saida ?? row.horaSaida ?? '').toString();
            const horaEntrada = sanitizeTime(horaEntradaRaw);
            const horaSaida = sanitizeTime(horaSaidaRaw);
            const rawSerialValue = row.SerialNumber || row.Serial || row.ID || row.Id || '';
            const rawSerial = rawSerialValue !== null && rawSerialValue !== undefined ? String(rawSerialValue) : '';
            const serialNormalized = rawSerial ? normalizeString(rawSerial) : '';
            const emailValue = row.EmailHC || row.Email || row.email || '';
            const email = emailValue || '';
            const emailNormalized = email ? normalizeString(email) : '';
            const nomeId = normalizeString(nome);
            const primaryId = nomeId || serialNormalized || emailNormalized || '';

            return {
                id: primaryId,
                nomeId,
                rawSerial,
                serialNormalized,
                nome,
                isoDate,
                dataBr: formatDateBR(isoDate),
                escala,
                modalidade,
                horaEntrada,
                horaSaida,
                horaEntradaMinutes: toMinutes(horaEntradaRaw || horaEntrada),
                escalaKey: normalizeString(escala || 'sem-escala'),
                email,
                emailNormalized
            };
        }

        function applyPontoData(records = [], {
            targetDate = '',
            scale = 'all',
            availableDates = [],
            scalesByDate = new Map(),
            lastUpdated = null,
            updateSelection = false,
            replaceExisting = false
        } = {}) {
            const normalizedDate = normalizeDateInput(targetDate);
            const scaleLabel = scale || 'all';
            const scaleKey = normalizeScaleKey(scaleLabel);
            const processed = (records || []).map((row) => normalizePontoRecord(row, normalizedDate)).filter(Boolean);
            const grouped = new Map();

            if (!processed.length && normalizedDate) {
                grouped.set(normalizedDate, []);
            }

            processed.forEach((entry) => {
                const iso = entry.isoDate || normalizedDate;
                if (!iso) return;
                if (!grouped.has(iso)) grouped.set(iso, []);
                grouped.get(iso).push(entry);
            });

            grouped.forEach((rows, iso) => {
                const existingAll = pontoState.byDate.get(iso) || [];
                let mergedAll;

                if (replaceExisting) {
                    if (scaleKey === 'all') {
                        mergedAll = rows.slice();
                        pontoState.byDate.set(iso, mergedAll);
                        Array.from(pontoState.cache.keys()).forEach((key) => {
                            if (key.startsWith(`${iso}__`)) {
                                pontoState.cache.delete(key);
                            }
                        });
                    } else {
                        const filteredAll = existingAll.filter((row) => normalizeScaleKey(row.escala || 'sem-escala') !== scaleKey);
                        mergedAll = mergeRecordLists(filteredAll, rows);
                        pontoState.byDate.set(iso, mergedAll);
                        pontoState.cache.delete(makePontoCacheKey(iso, scaleKey));
                    }
                } else {
                    mergedAll = scaleKey === 'all' ? rows.slice() : mergeRecordLists(existingAll, rows);
                    pontoState.byDate.set(iso, mergedAll);
                }

                if (!mergedAll) {
                    mergedAll = scaleKey === 'all' ? rows.slice() : mergeRecordLists(existingAll, rows);
                    pontoState.byDate.set(iso, mergedAll);
                }

                pontoState.cache.set(makePontoCacheKey(iso, 'all'), mergedAll);
                if (scaleKey !== 'all') {
                    pontoState.cache.set(makePontoCacheKey(iso, scaleKey), rows.slice());
                }
            });

            const dateSet = new Set(pontoState.dates);
            (availableDates || []).forEach((dateValue) => {
                const iso = normalizeDateInput(dateValue);
                if (iso) dateSet.add(iso);
            });
            grouped.forEach((_, iso) => {
                if (iso) dateSet.add(iso);
            });
            if (normalizedDate) {
                dateSet.add(normalizedDate);
            }
            pontoState.dates = Array.from(dateSet).filter(Boolean).sort((a, b) => b.localeCompare(a));

            if (!(scalesByDate instanceof Map)) {
                scalesByDate = parseAvailableScales(scalesByDate, normalizedDate);
            }

            scalesByDate.forEach((list, dateKey) => {
                const iso = normalizeDateInput(dateKey);
                if (!iso) return;
                const existing = new Set(pontoState.scalesByDate.get(iso) || []);
                (list || []).forEach((item) => {
                    if (item && typeof item === 'string') existing.add(item);
                });
                pontoState.scalesByDate.set(iso, Array.from(existing).sort((a, b) => a.localeCompare(b, 'pt-BR')));
            });

            grouped.forEach((rows, iso) => {
                const existing = new Set(pontoState.scalesByDate.get(iso) || []);
                rows.forEach((row) => {
                    if (row.escala && row.escala.trim()) existing.add(row.escala);
                });
                if (scaleKey !== 'all' && scaleLabel) {
                    existing.add(scaleLabel);
                }
                pontoState.scalesByDate.set(iso, Array.from(existing).sort((a, b) => a.localeCompare(b, 'pt-BR')));
            });

            pontoState.rawRows = Array.from(pontoState.byDate.values()).flat();
            pontoState.lastLoadedAt = lastUpdated || new Date();

            if (updateSelection) {
                if (normalizedDate) {
                    pontoState.selectedDate = normalizedDate;
                    pontoState.autoScaleByDate.set(normalizedDate, scaleLabel || 'all');
                }
                pontoState.selectedScale = scaleLabel || 'all';
            } else {
                if (!pontoState.selectedDate && normalizedDate) {
                    pontoState.selectedDate = normalizedDate;
                }
                if (normalizedDate && scaleKey !== 'all' && scaleLabel && !pontoState.autoScaleByDate.has(normalizedDate)) {
                    pontoState.autoScaleByDate.set(normalizedDate, scaleLabel);
                }
                if (!pontoState.selectedScale) {
                    pontoState.selectedScale = 'all';
                }
            }

            updatePontoHojeMap();
        }

        function getPontoRecords(date, scale = 'all') {
            const iso = normalizeDateInput(date);
            if (!iso) return [];
            const scaleKey = normalizeScaleKey(scale);
            const cacheKey = makePontoCacheKey(iso, scaleKey);
            if (pontoState.cache.has(cacheKey)) {
                return pontoState.cache.get(cacheKey);
            }
            if (scaleKey === 'all') {
                const base = pontoState.byDate.get(iso) || [];
                pontoState.cache.set(cacheKey, base);
                return base;
            }
            const base = pontoState.byDate.get(iso) || [];
            const filtered = base.filter((row) => normalizeString(row.escala || 'sem-escala') === scaleKey);
            pontoState.cache.set(cacheKey, filtered);
            return filtered;
        }

        function hasCachedPontoData(date, scale = 'all') {
            const iso = normalizeDateInput(date);
            if (!iso) return false;
            const scaleKey = normalizeScaleKey(scale);
            if (scaleKey === 'all') {
                return pontoState.cache.has(makePontoCacheKey(iso, 'all')) || pontoState.byDate.has(iso);
            }
            return pontoState.cache.has(makePontoCacheKey(iso, scaleKey));
        }

        function updatePontoHojeMap() {
            const todayISO = new Date().toISOString().slice(0, 10);
            appState.pontoHojeMap.clear();
            if (!appState.pontoHojeAliases) {
                appState.pontoHojeAliases = new Map();
            } else {
                appState.pontoHojeAliases.clear();
            }

            let todaysRows = getPontoRecords(todayISO, 'all');
            if (!todaysRows.length) {
                const scaleList = pontoState.scalesByDate.get(todayISO) || [];
                todaysRows = scaleList.flatMap((scale) => getPontoRecords(todayISO, scale));
            }

            todaysRows.forEach((row) => {
                const primaryKey = row.nomeId || row.id || row.serialNormalized || row.emailNormalized;
                if (!primaryKey) return;

                const entry = {
                    NomeCompleto: row.nome,
                    NomeID: row.nomeId || '',
                    Email: row.email || '',
                    EmailNormalizado: row.emailNormalized || '',
                    SerialNumber: row.rawSerial || '',
                    SerialNormalizado: row.serialNormalized || '',
                    HoraEntrada: row.horaEntrada,
                    HoraSaida: row.horaSaida,
                    Escala: row.escala,
                    Modalidade: row.modalidade || '',
                    DataISO: row.isoDate
                };

                appState.pontoHojeMap.set(primaryKey, entry);

                const aliasKeys = collectPontoIdentityAliases(row, primaryKey);
                aliasKeys.forEach((aliasKey) => {
                    if (!appState.pontoHojeAliases.has(aliasKey)) {
                        appState.pontoHojeAliases.set(aliasKey, primaryKey);
                    }
                });
            });
        }

        function collectPontoIdentityAliases(row = {}, primaryKey = '') {
            const aliases = new Set();
            const addAlias = (value) => {
                const normalized = normalizeString(value);
                if (!normalized || normalized === primaryKey) return;
                aliases.add(normalized);
            };

            addAlias(row.nomeId || row.nome);
            addAlias(row.email);
            addAlias(row.emailNormalized);
            addAlias(row.rawSerial);
            addAlias(row.serialNormalized);

            return Array.from(aliases);
        }

        function resolvePontoHojeRecordByKey(rawKey) {
            const normalized = normalizeString(rawKey);
            if (!normalized) return null;
            if (appState.pontoHojeMap.has(normalized)) {
                return appState.pontoHojeMap.get(normalized);
            }
            const aliasKey = appState.pontoHojeAliases?.get(normalized);
            if (aliasKey && appState.pontoHojeMap.has(aliasKey)) {
                return appState.pontoHojeMap.get(aliasKey);
            }
            return null;
        }

        function resolvePontoHojeRecordFromIdentity({ normName, normEmail, normSerial } = {}) {
            const keys = [normName, normEmail, normSerial];
            for (const key of keys) {
                const record = resolvePontoHojeRecordByKey(key);
                if (record) return record;
            }
            return null;
        }

        function hydratePontoSelectors() {
            const dateInput = document.getElementById('ponto-date-picker');
            const datalist = document.getElementById('ponto-date-options');
            const searchInput = document.getElementById('ponto-search-input');

            if (searchInput) {
                searchInput.value = pontoState.searchRaw || '';
            }

            if (dateInput) {
                if (pontoState.dates.length > 0) {
                    const sortedDates = [...pontoState.dates].sort((a, b) => a.localeCompare(b));
                    dateInput.min = sortedDates[0];
                    dateInput.max = sortedDates[sortedDates.length - 1];
                }
                if (pontoState.selectedDate) {
                    dateInput.value = pontoState.selectedDate;
                }
            }

            if (datalist) {
                datalist.innerHTML = pontoState.dates
                    .slice()
                    .sort((a, b) => b.localeCompare(a))
                    .map((date) => `<option value="${date}">${formatDateBR(date)}</option>`)
                    .join('');
            }

            document.querySelectorAll('#ponto-filter-bar .escala-pill').forEach((pill) => {
                const filter = pill.getAttribute('data-filter');
                pill.classList.toggle('active', filter === pontoState.filter);
            });

            updatePontoScaleOptions();
            updateDateNavigationButtons();
        }

        function updatePontoScaleOptions() {
            const select = document.getElementById('ponto-scale-select');
            if (!select) return;

            const availableScales = pontoState.scalesByDate.get(pontoState.selectedDate) || [];
            let options = '<option value="all">Todas as escalas</option>';
            availableScales.forEach((scaleName) => {
                const safe = escapeHtml(scaleName);
                options += `<option value="${safe}">${safe}</option>`;
            });

            select.innerHTML = options;
            if (pontoState.selectedScale !== 'all') {
                const normalizedSelected = normalizeString(pontoState.selectedScale);
                const normalizedAvailable = availableScales.map((item) => normalizeString(item));
                if (!normalizedAvailable.includes(normalizedSelected)) {
                    pontoState.selectedScale = 'all';
                }
            }
            select.value = pontoState.selectedScale || 'all';
        }

        function enrichPontoRows(rows = []) {
            const baselineByScale = new Map();
            rows.forEach((row) => {
                if (Number.isFinite(row.horaEntradaMinutes)) {
                    const current = baselineByScale.get(row.escalaKey);
                    baselineByScale.set(row.escalaKey, current === undefined ? row.horaEntradaMinutes : Math.min(current, row.horaEntradaMinutes));
                }
            });

            return rows.map((row) => {
                const baseline = baselineByScale.get(row.escalaKey);
                let status = 'absent';
                let statusLabel = 'Falta';
                let badgeClass = 'badge badge-red';
                let delayMinutes = null;

                if (Number.isFinite(row.horaEntradaMinutes)) {
                    if (baseline !== undefined && baseline !== null) {
                        const diff = Math.max(0, row.horaEntradaMinutes - baseline);
                        delayMinutes = diff;
                        if (diff > ATRASO_THRESHOLD_MINUTES) {
                            status = 'late';
                            statusLabel = diff ? `Atraso (+${diff} min)` : 'Atraso';
                            badgeClass = 'badge badge-yellow';
                        } else {
                            status = 'present';
                            statusLabel = 'Presente';
                            badgeClass = 'badge badge-green';
                        }
                    } else {
                        status = 'present';
                        statusLabel = 'Presente';
                        badgeClass = 'badge badge-green';
                    }
                }

                const searchKey = normalizeString([
                    row.nome,
                    row.escala,
                    row.modalidade,
                    row.horaEntrada,
                    row.horaSaida,
                    row.email,
                    row.rawSerial,
                    statusLabel
                ].filter(Boolean).join(' '));

                return {
                    ...row,
                    status,
                    statusLabel,
                    badgeClass,
                    delayMinutes,
                    searchKey,
                    dataBR: formatDateBR(row.isoDate)
                };
            });
        }

        function refreshPontoView() {
            try {
                const dataset = buildPontoDataset(pontoState.selectedDate, pontoState.selectedScale);
                const enriched = dataset.rows || [];
                const presentCount = enriched.filter((row) => row.status === 'present' || row.status === 'late').length;
                const lateCount = enriched.filter((row) => row.status === 'late').length;
                const absentCount = enriched.filter((row) => row.status === 'absent').length;
                const totalEscalados = Math.max(dataset.rosterSize || 0, enriched.length || 0, TOTAL_ESCALADOS);

                updatePontoSummary({
                    total: totalEscalados,
                    present: presentCount,
                    late: lateCount,
                    absent: absentCount
                });
                updatePontoFilterCounters(enriched);

                const searchTerm = pontoState.search || '';
                const filter = pontoState.filter || 'all';
                const filteredRows = enriched.filter((row) => {
                    let matchesFilter = filter === 'all';
                    if (!matchesFilter) {
                        if (filter === 'present') {
                            matchesFilter = row.status === 'present' || row.status === 'late';
                        } else {
                            matchesFilter = row.status === filter;
                        }
                    }
                    const matchesSearch = !searchTerm || row.searchKey.includes(searchTerm);
                    return matchesFilter && matchesSearch;
                });

                renderPontoTable(filteredRows, enriched.length, (dataset.baseRecords || []).length);
                updatePontoMeta();
                renderEscalaOverview();
            } catch (error) {
                console.error('[refreshPontoView] Erro ao atualizar painel de ponto:', error);
                showError('Erro ao atualizar o painel de ponto.');
            }
        }

        function renderEscalaOverview() {
            const grid = document.getElementById('escala-overview-grid');
            const emptyState = document.getElementById('escala-overview-empty');
            const statsContainer = document.getElementById('escala-overview-stats');
            const dateLabel = document.getElementById('escala-overview-date');

            if (!grid || !emptyState || !statsContainer || !dateLabel) return;

            const targetDate = normalizeDateInput(pontoState.selectedDate) || new Date().toISOString().slice(0, 10);
            dateLabel.textContent = formatDateLabel(targetDate);

            const dataset = buildPontoDataset(targetDate, 'all');
            const rosterEntries = dataset.rosterEntries || [];
            const lookup = buildPontoRowLookup(dataset.rows || []);

            const counts = {
                total: Math.max(rosterEntries.length || 0, (dataset.rows || []).length || 0, TOTAL_ESCALADOS),
                present: 0,
                late: 0,
                absent: 0
            };
            const preparedEntries = [];

            if (!rosterEntries.length) {
                grid.innerHTML = '';
                emptyState.hidden = false;
                emptyState.querySelector('p').textContent = 'Nenhuma escala encontrada para a data selecionada.';
                statsContainer.innerHTML = `
                    <div class="escala-stat-card">
                        <span class="label">Escalados</span>
                        <span class="value">${TOTAL_ESCALADOS}</span>
                    </div>
                    <div class="escala-stat-card is-green">
                        <span class="label">Presentes</span>
                        <span class="value">0</span>
                    </div>
                    <div class="escala-stat-card is-amber">
                        <span class="label">Atrasos</span>
                        <span class="value">0</span>
                    </div>
                    <div class="escala-stat-card is-red">
                        <span class="label">Faltas</span>
                        <span class="value">${TOTAL_ESCALADOS}</span>
                    </div>
                `;
                renderEscalaSheetPreview({ entries: [], targetDate, counts });
                return;
            }

            const groups = {
                morning: [],
                afternoon: [],
                night: [],
                flex: []
            };

            const sortedRoster = rosterEntries.slice().sort((a, b) => {
                const nameA = (a.NomeCompleto || a.nome || '').toLocaleLowerCase('pt-BR');
                const nameB = (b.NomeCompleto || b.nome || '').toLocaleLowerCase('pt-BR');
                return nameA.localeCompare(nameB, 'pt-BR');
            });

            sortedRoster.forEach((entry) => {
                const keys = entry.__normalizedKeys || {};
                const possibleKeys = [
                    keys.nomeId,
                    keys.email,
                    keys.serial,
                    entry.EmailHC,
                    entry.NomeCompleto,
                    entry.SerialNumber
                ];

                let matchedRow = null;
                for (const candidate of possibleKeys) {
                    const normalized = normalizeString(candidate);
                    if (normalized && lookup.has(normalized)) {
                        matchedRow = lookup.get(normalized);
                        break;
                    }
                }

                const slot = determineRosterSlot(entry);
                const bucket = groups[slot] ? slot : 'flex';
                const status = matchedRow ? matchedRow.status : 'absent';
                if (status === 'present') {
                    counts.present += 1;
                } else if (status === 'late') {
                    counts.present += 1;
                    counts.late += 1;
                } else {
                    counts.absent += 1;
                }

                const escalaNome = entry.__escalaNome || matchedRow?.escala || '';
                const turnoRaw = entry.Turno || entry.turno || entry.Periodo || entry['Período'] || entry.periodo || '';
                const turnoDisplay = turnoRaw || (bucket === 'morning' ? 'Manhã' : bucket === 'afternoon' ? 'Tarde' : bucket === 'night' ? 'Noturno' : 'Flexível');
                const horaEntrada = matchedRow?.horaEntrada || entry.HoraEntrada || entry['HoraEntrada'] || entry['Hora Entrada'] || '';
                const horaSaida = matchedRow?.horaSaida || entry.HoraSaida || entry['HoraSaida'] || entry['Hora Saída'] || '';
                const horarioRaw = entry.Horario || entry.horario || entry.HorarioPrevisto || entry['Horário'] || entry['Horário Previsto'] || '';
                const horario = horarioRaw || (horaEntrada && horaSaida ? `${horaEntrada} – ${horaSaida}` : horaEntrada || horaSaida || '');
                const modalidade = matchedRow?.modalidade
                    || entry['Pratica/Teorica'] || entry['Prática/Teórica'] || entry.Modalidade || entry.modalidade || entry.Tipo || entry.Atividade || '';
                const serialRaw = entry.SerialNumber || entry.Serial || entry.ID || entry.Id || '';
                const prepared = {
                    nome: entry.NomeCompleto || entry.nome || '—',
                    email: entry.EmailHC || entry.Email || entry.email || '',
                    curso: entry.Curso || '',
                    escala: escalaNome,
                    status,
                    statusLabel: matchedRow ? matchedRow.statusLabel : 'Falta',
                    badgeClass: matchedRow ? matchedRow.badgeClass : 'badge badge-red',
                    horaEntrada,
                    horaSaida,
                    turno: turnoDisplay,
                    horario,
                    modalidade,
                    serial: serialRaw ? String(serialRaw).trim() : '',
                    slot: bucket
                };

                groups[bucket].push(prepared);
                preparedEntries.push(prepared);
            });

            counts.absent = Math.max(counts.absent, Math.max(counts.total - counts.present, 0));

            renderEscalaSheetPreview({ entries: preparedEntries, targetDate, counts });

            statsContainer.innerHTML = `
                <div class="escala-stat-card">
                    <span class="label">Escalados</span>
                    <span class="value">${counts.total}</span>
                </div>
                <div class="escala-stat-card is-green">
                    <span class="label">Presentes</span>
                    <span class="value">${counts.present}</span>
                </div>
                <div class="escala-stat-card is-amber">
                    <span class="label">Atrasos</span>
                    <span class="value">${counts.late}</span>
                </div>
                <div class="escala-stat-card is-red">
                    <span class="label">Faltas</span>
                    <span class="value">${counts.absent}</span>
                </div>
            `;

            const groupMeta = {
                morning: { title: 'Turno da Manhã', description: 'Bolsistas e residentes', hours: '08h às 13h' },
                afternoon: { title: 'Turno da Tarde', description: 'Especialização paga', hours: '13h às 18h' },
                night: { title: 'Turno Noturno', description: 'Conforme escala vigente', hours: 'Horário flexível' },
                flex: { title: 'Outros Turnos', description: 'Plantões e ajustes', hours: 'Definido na escala' }
            };

            const order = ['morning', 'afternoon', 'night', 'flex'];
            const sections = order.map((key) => {
                const items = groups[key];
                if (!items || !items.length) return '';
                const meta = groupMeta[key];
                const listItems = items.map((item) => {
                    const extraParts = [];
                    if (item.curso) extraParts.push(item.curso);
                    if (item.escala) extraParts.push(item.escala);
                    const extraMarkup = extraParts.length
                        ? `<span class="escala-person-extra">${escapeHtml(extraParts.join(' • '))}</span>`
                        : '';
                    const hours = item.horaEntrada
                        ? `<span class="escala-person-hours">${escapeHtml(item.horaEntrada)}${item.horaSaida ? ` – ${escapeHtml(item.horaSaida)}` : ''}</span>`
                        : '';

                    return `
                        <li class="escala-person">
                            <div class="escala-person-info">
                                <span class="escala-person-name">${escapeHtml(item.nome)}</span>
                                ${item.email ? `<span class="escala-person-email">${escapeHtml(item.email)}</span>` : ''}
                                ${extraMarkup}
                            </div>
                            <div class="escala-person-status">
                                <span class="${item.badgeClass}">${escapeHtml(item.statusLabel)}</span>
                                ${hours}
                            </div>
                        </li>
                    `;
                }).join('');

                return `
                    <section class="escala-column">
                        <header>
                            <div>
                                <h3>${escapeHtml(meta.title)}</h3>
                                <p>${escapeHtml(meta.description)}</p>
                            </div>
                            <span class="escala-column-hours">${escapeHtml(meta.hours)}</span>
                        </header>
                        <ul>${listItems}</ul>
                    </section>
                `;
            }).filter(Boolean).join('');

            grid.innerHTML = sections;
            emptyState.hidden = Boolean(sections);
            if (!sections) {
                emptyState.querySelector('p').textContent = 'Nenhum profissional escalado para esta data.';
            }
        }

        function resolveEscalaSheetUrl(escala = {}) {
            if (!escala || typeof escala !== 'object') return '';
            const candidates = [
                escala.planilhaUrl,
                escala.planilhaURL,
                escala.planilhaLink,
                escala.sheetUrl,
                escala.sheetURL,
                escala.sheetLink,
                escala.spreadsheetUrl,
                escala.linkPlanilha,
                escala.linkDaPlanilha,
                escala.link,
                escala.urlPlanilha,
                escala.url
            ];
            for (const candidate of candidates) {
                if (typeof candidate === 'string' && candidate.trim()) {
                    return candidate.trim();
                }
            }
            return '';
        }

        function formatScalePeriodLabel(escala) {
            if (!escala) return '';
            const rawPeriod = typeof escala.periodo === 'string' ? escala.periodo.trim() : '';
            if (rawPeriod) return rawPeriod;

            const headers = Array.isArray(escala.headersDay) ? escala.headersDay : [];
            const dates = headers
                .map((day) => normalizeHeaderDay(day))
                .filter(Boolean)
                .map((day) => (typeof _esc_parseDMInferYear === 'function' ? _esc_parseDMInferYear(day) : null))
                .filter((date) => date instanceof Date && !Number.isNaN(date.getTime()))
                .sort((a, b) => a - b);

            if (!dates.length) return '';

            const first = dates[0];
            const last = dates[dates.length - 1];
            const firstLabel = first.toLocaleDateString('pt-BR');
            const lastLabel = last.toLocaleDateString('pt-BR');
            return firstLabel === lastLabel
                ? `Dia ${firstLabel}`
                : `Período: ${firstLabel} a ${lastLabel}`;
        }

        function renderEscalaSheetPreview({ entries = [], targetDate, counts = {} } = {}) {
            const card = document.getElementById('escala-sheet-card');
            const tbody = document.getElementById('escala-sheet-table-body');
            const emptyState = document.getElementById('escala-sheet-empty');
            const button = document.getElementById('escala-open-sheet');
            const title = document.getElementById('escala-sheet-title');
            const period = document.getElementById('escala-sheet-period');
            const countEl = document.getElementById('escala-sheet-count');

            if (!card || !tbody || !emptyState || !button || !title || !period || !countEl) return;

            const scale = getScaleForDate(targetDate) || findActiveScale();
            const sheetUrl = resolveEscalaSheetUrl(scale);
            const scaleName = scale?.nomeExibicao || scale?.nomeEscala || scale?.nome || '';

            title.textContent = scaleName ? `Pré-visualização • ${scaleName}` : 'Pré-visualização da Escala';
            const periodLabel = formatScalePeriodLabel(scale) || (targetDate ? formatDateLabel(targetDate) : '--');
            period.textContent = periodLabel;
            const totalDisplay = counts.total || entries.length || 0;
            countEl.textContent = `Escalados: ${totalDisplay}`;

            if (sheetUrl) {
                button.disabled = false;
                button.classList.remove('is-disabled');
                button.title = 'Abrir planilha da escala no Google Planilhas';
                button.onclick = (event) => {
                    event.stopPropagation();
                    window.open(sheetUrl, '_blank', 'noopener');
                };
                card.onclick = (event) => {
                    const interactive = event.target.closest('button, a, input, select, textarea, label');
                    if (interactive) return;
                    window.open(sheetUrl, '_blank', 'noopener');
                };
                card.onkeydown = (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        window.open(sheetUrl, '_blank', 'noopener');
                    }
                };
                card.classList.add('is-clickable');
                card.setAttribute('role', 'button');
                card.tabIndex = 0;
                card.dataset.sheetUrl = sheetUrl;
            } else {
                button.disabled = true;
                button.classList.add('is-disabled');
                button.title = 'Planilha indisponível';
                button.onclick = null;
                card.onclick = null;
                card.onkeydown = null;
                card.classList.remove('is-clickable');
                card.removeAttribute('role');
                card.removeAttribute('tabindex');
                delete card.dataset.sheetUrl;
            }

            if (!entries.length) {
                tbody.innerHTML = '';
                emptyState.hidden = false;
                return;
            }

            emptyState.hidden = true;

            const shiftOrder = { morning: 0, afternoon: 1, night: 2, flex: 3 };
            const sorted = entries.slice().sort((a, b) => {
                const orderA = shiftOrder[a.slot] ?? 99;
                const orderB = shiftOrder[b.slot] ?? 99;
                if (orderA !== orderB) return orderA - orderB;
                return (a.nome || '').localeCompare(b.nome || '', 'pt-BR');
            });

            tbody.innerHTML = sorted.map((item) => {
                const emailLine = item.email ? `<span class="escala-sheet-email">${escapeHtml(item.email)}</span>` : '';
                const serialLine = item.serial ? `<span class="escala-sheet-extra">Crachá: ${escapeHtml(item.serial)}</span>` : '';
                const infoLines = [emailLine, serialLine].filter(Boolean).join('');
                let horarioValue;
                if (item.horario) {
                    horarioValue = escapeHtml(item.horario);
                } else if (item.horaEntrada && item.horaSaida) {
                    horarioValue = `${escapeHtml(item.horaEntrada)} – ${escapeHtml(item.horaSaida)}`;
                } else {
                    horarioValue = escapeHtml(item.horaEntrada || item.horaSaida || '—');
                }
                const modalidadeValue = escapeHtml(item.modalidade || item.escala || '—');
                const turnoValue = escapeHtml(item.turno || '—');

                return `
                    <tr>
                        <td data-label="Profissional">
                            <div class="escala-sheet-name">
                                <span class="escala-sheet-name-main">${escapeHtml(item.nome)}</span>
                                ${infoLines}
                            </div>
                        </td>
                        <td data-label="Curso">${escapeHtml(item.curso || '—')}</td>
                        <td data-label="Turno">${turnoValue}</td>
                        <td data-label="Horário">${horarioValue}</td>
                        <td data-label="Modalidade">${modalidadeValue}</td>
                        <td data-label="Status"><span class="${item.badgeClass}">${escapeHtml(item.statusLabel)}</span></td>
                    </tr>
                `;
            }).join('');
        }

        function updatePontoSummary(counts = {}) {
            const mappings = [
                ['ponto-count-total', counts.total || 0],
                ['ponto-count-present', counts.present || 0],
                ['ponto-count-late', counts.late || 0],
                ['ponto-count-absent', counts.absent || 0]
            ];
            mappings.forEach(([id, value]) => {
                const element = document.getElementById(id);
                if (element) element.textContent = value;
            });
        }

        function updatePontoFilterCounters(rows = []) {
            const counters = {
                'ponto-filter-total': rows.length,
                'ponto-filter-present': rows.filter((row) => row.status === 'present' || row.status === 'late').length,
                'ponto-filter-late': rows.filter((row) => row.status === 'late').length,
                'ponto-filter-absent': rows.filter((row) => row.status === 'absent').length
            };

            Object.entries(counters).forEach(([id, value]) => {
                const element = document.getElementById(id);
                if (element) element.textContent = value;
            });
        }

        function renderPontoTable(rows = [], enrichedCount = 0, totalBase = 0) {
            const tbody = document.getElementById('ponto-table-body');
            const emptyState = document.getElementById('ponto-empty-state');
            if (!tbody || !emptyState) return;

            if (rows.length === 0) {
                tbody.innerHTML = '';
                emptyState.hidden = false;
                const message = emptyState.querySelector('p');
                if (message) {
                    if (totalBase === 0) {
                        message.textContent = pontoState.selectedDate
                            ? `Nenhum registro encontrado para ${formatDateBR(pontoState.selectedDate)}.`
                            : 'Nenhum registro disponível.';
                    } else if (enrichedCount === 0) {
                        message.textContent = 'Nenhum registro disponível para a escala selecionada.';
                    } else {
                        message.textContent = 'Nenhum registro encontrado para os filtros selecionados.';
                    }
                }
                return;
            }

            emptyState.hidden = true;
            tbody.innerHTML = rows.map(renderPontoRow).join('');
        }

        function renderPontoRow(row) {
            const initials = getInitials(row.nome);
            const escalaContent = row.escala && row.escala.trim().length > 0
                ? `<span class="ponto-escala-pill">${escapeHtml(row.escala)}</span>`
                : '<span class="ponto-escala-pill">Sem escala</span>';
            const modalidadeContent = row.modalidade && row.modalidade.trim().length > 0
                ? `<span class="ponto-modalidade">${escapeHtml(row.modalidade)}</span>`
                : '<span class="ponto-modalidade">—</span>';
            const emailLine = row.email ? `<span class="ponto-person-email">${escapeHtml(row.email)}</span>` : '';
            const serialLine = row.rawSerial ? `<span class="ponto-person-extra">Crachá: ${escapeHtml(row.rawSerial)}</span>` : '';

            return `
                <tr class="ponto-row" data-status="${row.status}" data-search="${row.searchKey}">
                    <td data-label="Nome">
                        <div class="ponto-person">
                            <div class="ponto-avatar">${escapeHtml(initials)}</div>
                            <div class="ponto-person-info">
                                <span class="ponto-person-name">${escapeHtml(row.nome || '—')}</span>
                                ${emailLine}
                                ${serialLine}
                            </div>
                        </div>
                    </td>
                    <td data-label="Data">${escapeHtml(row.dataBR)}</td>
                    <td data-label="Hora de Entrada">${escapeHtml(row.horaEntrada || '—')}</td>
                    <td data-label="Hora de Saída">${escapeHtml(row.horaSaida || '—')}</td>
                    <td data-label="Escala">
                        <div class="ponto-escala-cell">
                            ${escalaContent}
                            <span class="${row.badgeClass}">${escapeHtml(row.statusLabel)}</span>
                        </div>
                    </td>
                    <td data-label="Prática/Teórica">${modalidadeContent}</td>
                </tr>`;
        }

        function updatePontoMeta() {
            const dateLabel = document.getElementById('ponto-active-date');
            if (dateLabel) {
                dateLabel.textContent = pontoState.selectedDate ? formatDateLabel(pontoState.selectedDate) : '--';
            }
            const syncLabel = document.getElementById('ponto-last-sync');
            if (syncLabel) {
                syncLabel.textContent = pontoState.lastLoadedAt
                    ? `Atualizado ${pontoState.lastLoadedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
                    : 'Dados não carregados';
            }
        }

        function handlePontoFilterClick(event) {
            const button = event.target.closest('.escala-pill');
            if (!button) return;
            const filter = button.getAttribute('data-filter');
            if (!filter) return;

            pontoState.filter = filter;
            document.querySelectorAll('#ponto-filter-bar .escala-pill').forEach((pill) => {
                pill.classList.toggle('active', pill === button);
            });
            refreshPontoView();
        }

        function handlePontoSearch(event) {
            const value = event.target.value || '';
            pontoState.searchRaw = value;
            pontoState.search = normalizeString(value);
            refreshPontoView();
        }

        async function handlePontoDateChange(event) {
            const isoValue = normalizeDateInput(event.target.value);
            if (!isoValue) return;
            const isSameDate = isoValue === pontoState.selectedDate;
            pontoState.selectedDate = isoValue;
            pontoState.selectedScale = 'all';
            pontoState.filter = 'all';
            pontoState.search = '';
            pontoState.searchRaw = '';
            if (!isSameDate || !hasCachedPontoData(isoValue, 'all')) {
                await ensurePontoData(isoValue, 'all', { showInlineSpinner: true });
            }
            hydratePontoSelectors();
            refreshPontoView();
        }

        async function handlePontoScaleChange(event) {
            const scaleValue = event.target.value || 'all';
            if (scaleValue === pontoState.selectedScale) return;
            pontoState.selectedScale = scaleValue;
            pontoState.filter = 'all';
            const currentDate = pontoState.selectedDate;
            if (currentDate) {
                if (!hasCachedPontoData(currentDate, scaleValue)) {
                    await ensurePontoData(currentDate, scaleValue, { showInlineSpinner: true });
                }
            }
            hydratePontoSelectors();
            refreshPontoView();
        }

        async function handlePontoRefresh() {
            const todayISO = new Date().toISOString().slice(0, 10);
            const dateIso = normalizeDateInput(pontoState.selectedDate) || todayISO;
            const scaleLabel = pontoState.selectedScale || 'all';
            const autoScale = pontoState.autoScaleByDate.get(dateIso);
            const autoScaleKey = autoScale ? normalizeScaleKey(autoScale) : 'all';
            const currentScaleKey = normalizeScaleKey(scaleLabel);
            const useTodayEndpointAll = dateIso === todayISO && (currentScaleKey === 'all' || currentScaleKey === autoScaleKey);

            await ensurePontoData(dateIso, 'all', {
                showInlineSpinner: true,
                useTodayEndpoint: useTodayEndpointAll,
                forceReload: true,
                replaceExisting: true
            });

            if (scaleLabel !== 'all') {
                const useTodayEndpointScale = dateIso === todayISO && currentScaleKey === autoScaleKey;
                await ensurePontoData(dateIso, scaleLabel, {
                    showInlineSpinner: false,
                    useTodayEndpoint: useTodayEndpointScale,
                    forceReload: true,
                    replaceExisting: true
                });
            }

            hydratePontoSelectors();
            refreshPontoView();
        }

        async function loadPontoData({ date, scale = 'all', showInlineSpinner = false, useTodayEndpoint = false, adoptSelection = false, replaceExisting = false } = {}) {
            const normalizedDate = normalizeDateInput(date);
            const scaleLabel = scale || 'all';
            const scaleKey = normalizeScaleKey(scaleLabel);
            const loadingBanner = document.getElementById('ponto-loading-state');
            if (loadingBanner) {
                loadingBanner.hidden = false;
                loadingBanner.textContent = showInlineSpinner ? 'Atualizando registros do ponto...' : 'Carregando registros do ponto...';
            }

            if (pontoState.isLoading) {
                console.warn('[loadPontoData] Requisição anterior ainda está em andamento.');
            }
            pontoState.isLoading = true;

            try {
                const url = new URL(API_URL);
                if (useTodayEndpoint) {
                    url.searchParams.set('action', 'getPontoHoje_');
                } else {
                    url.searchParams.set('action', 'getPontoPorEscala_');
                    if (normalizedDate) {
                        url.searchParams.set('data', normalizedDate);
                    }
                    if (scaleKey !== 'all') {
                        url.searchParams.set('escala', scaleLabel);
                    }
                }

                const response = await fetch(url.toString());
                if (!response.ok) {
                    throw new Error(`Rede (${url.searchParams.get('action')}): ${response.statusText} (${response.status})`);
                }

                const json = await response.json();
                if (json && json.success === false) {
                    throw new Error(json.error || 'Resposta inválida do backend.');
                }

                const payload = extractPontoPayload(json);
                const resolvedDate = payload.selectedDate || normalizedDate || (payload.availableDates[0] || '');
                const resolvedScale = payload.selectedScale || scaleLabel || 'all';
                const lastUpdated = payload.lastUpdated || new Date();

                applyPontoData(payload.records || [], {
                    targetDate: resolvedDate,
                    scale: resolvedScale,
                    availableDates: payload.availableDates,
                    scalesByDate: payload.scalesByDate,
                    lastUpdated,
                    updateSelection: adoptSelection,
                    replaceExisting
                });

                console.log(`[loadPontoData] Carregados ${(payload.records || []).length} registros (${resolvedScale || 'all'}) para ${resolvedDate || 'sem-data'}.`);

                return { success: true, selectedDate: resolvedDate, selectedScale: resolvedScale };
            } catch (error) {
                console.error('[loadPontoData] Erro ao carregar dados de ponto:', error);
                showError(`Falha ao carregar dados de ponto: ${error.message}`);
                throw error;
            } finally {
                pontoState.isLoading = false;
                if (loadingBanner) {
                    loadingBanner.hidden = true;
                }
            }
        }

        async function ensurePontoData(date, scale = 'all', { showInlineSpinner = false, useTodayEndpoint = false, adoptSelection = false, forceReload = false, replaceExisting = false } = {}) {
            const isoDate = normalizeDateInput(date);
            const scaleLabel = scale || 'all';
            if (!forceReload && isoDate && hasCachedPontoData(isoDate, scaleLabel)) {
                return { success: true, cached: true, selectedDate: isoDate, selectedScale: scaleLabel };
            }
            try {
                if (forceReload && isoDate) {
                    if (scaleLabel === 'all') {
                        pontoState.byDate.delete(isoDate);
                        Array.from(pontoState.cache.keys()).forEach((key) => {
                            if (key.startsWith(`${isoDate}__`)) {
                                pontoState.cache.delete(key);
                            }
                        });
                    } else {
                        pontoState.cache.delete(makePontoCacheKey(isoDate, scaleLabel));
                    }
                }
                return await loadPontoData({
                    date: isoDate,
                    scale: scaleLabel,
                    showInlineSpinner,
                    useTodayEndpoint,
                    adoptSelection,
                    replaceExisting: replaceExisting || forceReload
                });
            } catch (error) {
                console.error('[ensurePontoData] Falha ao garantir dados de ponto:', error);
                return null;
            }
        }

        async function initializePontoPanel() {
            const todayISO = new Date().toISOString().slice(0, 10);
            const result = await ensurePontoData(todayISO, 'all', { useTodayEndpoint: true, adoptSelection: true });
            if (result && result.selectedDate) {
                pontoState.selectedDate = result.selectedDate;
            } else if (!pontoState.selectedDate) {
                pontoState.selectedDate = todayISO;
            }
            if (result && result.selectedScale) {
                pontoState.selectedScale = result.selectedScale;
            } else if (!pontoState.selectedScale) {
                pontoState.selectedScale = 'all';
            }
            if (!pontoState.dates.includes(pontoState.selectedDate)) {
                pontoState.dates.push(pontoState.selectedDate);
                pontoState.dates.sort((a, b) => b.localeCompare(a));
            }
            hydratePontoSelectors();
            refreshPontoView();
        }

        function renderStudentList(students) {
             try {
                 const panel = document.getElementById('student-list-panel'); 
                 if (!panel) return;
                 
                 if (!students || students.length === 0) { panel.innerHTML = '<p class="text-slate-500 p-6 text-center">Nenhum aluno.</p>'; return; } 
                 
                 const grouped = students.reduce((acc, s) => { const c = s.Curso || 'Sem Curso'; if (!acc[c]) acc[c] = []; acc[c].push(s); return acc; }, {}); 
                 const courses = Object.keys(grouped).sort((a, b) => a.localeCompare(b));
                 
                 let html = ''; 
                 courses.forEach(c => { 
                     html += `<div class="student-group" data-course="${c}"><h3 class="student-group-header">${c} (${grouped[c].length})</h3><div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 p-1">`; 
                     
                     grouped[c].sort((a,b) => a.NomeCompleto.localeCompare(b.NomeCompleto)).forEach(s => { 
                         const img = s.FotoID ? `https://lh3.googleusercontent.com/d/${s.FotoID}=s96-c` : 'https://placehold.co/60x60/e2e8f0/64748b?text=?'; 
                         const inactive = s.Status !== 'Ativo'; 
                         const inactiveClass = inactive ? 'inactive-card' : ''; 
                         const inactiveBadge = inactive ? '<span class="badge badge-red inactive-badge">Inativo</span>' : ''; 
                         
                         // [ORION] Removido 'onclick' do HTML.
                         html += `<div class="student-card ${inactiveClass}" data-student-email="${s.EmailHC}" data-student-name="${normalizeString(s.NomeCompleto)}">
                                      ${inactiveBadge}
                                      <img src="${img}" alt="Foto" onerror="this.src='https://placehold.co/60x60/e2e8f0/64748b?text=?'">
                                      <p class="student-name">${s.NomeCompleto}</p>
                                      <p class="student-course mt-0.5">${s.Curso}</p>
                                  </div>`; 
                     }); 
                     html += `</div></div>`; 
                 }); 
                 panel.innerHTML = html;
             } catch (e) { console.error("[renderStudentList] Erro:", e); showError("Erro ao renderizar lista de alunos."); }
        }

        function getRosterForDate(dateIso) {
            const iso = normalizeDateInput(dateIso);
            if (!iso) return [];
            const target = isoToDayMonth(iso);
            if (!target) return [];

            const rosterMap = new Map();
            Object.values(appState.escalas || {}).forEach((escala = {}) => {
                const headers = Array.isArray(escala.headersDay) ? escala.headersDay : [];
                const matchesDate = headers.some((day) => normalizeHeaderDay(day) === target);
                if (!matchesDate) return;

                (escala.alunos || []).forEach((aluno) => {
                    if (!aluno) return;
                    const nomeNorm = normalizeString(aluno.NomeCompleto || aluno.nomeCompleto || aluno.Nome || aluno.nome);
                    const emailNorm = normalizeString(aluno.EmailHC || aluno.Email || aluno.email);
                    const serialRaw = aluno.SerialNumber || aluno.Serial || aluno.ID || aluno.Id || '';
                    const serialNorm = normalizeString(serialRaw ? String(serialRaw) : '');
                    const key = nomeNorm || emailNorm || serialNorm;
                    if (!key || rosterMap.has(key)) return;
                    rosterMap.set(key, {
                        ...aluno,
                        __escalaNome: escala.nomeEscala || escala.nome || '',
                        __headers: headers
                    });
                });
            });

            return Array.from(rosterMap.values());
        }

        function buildRosterNormalizedRecords(dateIso, scaleLabel = 'all') {
            const iso = normalizeDateInput(dateIso);
            if (!iso) return { normalizedRecords: [], rosterEntries: [] };

            const roster = getRosterForDate(iso);
            if (!roster.length) return { normalizedRecords: [], rosterEntries: [] };

            const scaleKey = normalizeScaleKey(scaleLabel);
            const normalizedRecords = [];
            const rosterEntries = [];

            roster.forEach((entry) => {
                const escalaNome = entry.Escala || entry.escala || entry.__escalaNome || scaleLabel || '';
                const escalaKey = normalizeScaleKey(escalaNome);
                if (scaleKey !== 'all' && escalaKey !== scaleKey) return;

                const record = normalizePontoRecord({
                    NomeCompleto: entry.NomeCompleto || entry.nomeCompleto || entry.Nome || entry.nome || '',
                    EmailHC: entry.EmailHC || entry.Email || entry.email || '',
                    SerialNumber: entry.SerialNumber || entry.Serial || entry.ID || entry.Id || '',
                    Escala: escalaNome,
                    'Pratica/Teorica': entry['Pratica/Teorica'] || entry['Prática/Teórica'] || entry.Modalidade || entry.modalidade || entry.Tipo || entry.Turno || entry.Periodo || '',
                    DataISO: iso
                }, iso);

                if (record) {
                    if (!record.escala && escalaNome) {
                        record.escala = escalaNome;
                    }
                    rosterEntries.push({
                        ...entry,
                        __escalaNome: escalaNome,
                        __normalizedKeys: {
                            nomeId: record.nomeId,
                            email: record.emailNormalized,
                            serial: record.serialNormalized
                        }
                    });
                    normalizedRecords.push(record);
                }
            });

            return { normalizedRecords, rosterEntries };
        }

        function buildPontoDataset(dateIso, scaleLabel = 'all') {
            const iso = normalizeDateInput(dateIso);
            const scale = scaleLabel || 'all';
            if (!iso) return { rows: [], baseRecords: [], rosterEntries: [], rosterSize: 0 };

            const baseRecords = getPontoRecords(iso, scale) || [];
            const { normalizedRecords, rosterEntries } = buildRosterNormalizedRecords(iso, scale);
            const combined = normalizedRecords.length ? mergeRecordLists(normalizedRecords, baseRecords) : baseRecords.slice();
            const enrichedRows = enrichPontoRows(combined);

            return { rows: enrichedRows, baseRecords, rosterEntries, rosterSize: rosterEntries.length };
        }

        function buildPontoRowLookup(rows = []) {
            const map = new Map();
            rows.forEach((row) => {
                if (!row) return;
                const primary = row.nomeId || row.id || row.emailNormalized || row.serialNormalized || '';
                const keys = new Set([primary, row.nomeId, row.id, row.emailNormalized, row.serialNormalized]);
                collectPontoIdentityAliases(row, primary).forEach((alias) => keys.add(alias));
                keys.forEach((key) => {
                    const normalized = normalizeString(key);
                    if (normalized) {
                        map.set(normalized, row);
                    }
                });
            });
            return map;
        }

        function determineRosterSlot(entry = {}) {
            const turnoRaw = entry.Turno || entry.turno || entry.Periodo || entry['Período'] || entry.periodo || entry.Horario || entry.horario || '';
            const turno = normalizeString(turnoRaw);
            if (turno.includes('noite') || turno.includes('noturno')) return 'night';
            if (turno.includes('tarde') || turno.includes('vespertino')) return 'afternoon';
            if (turno.includes('manha') || turno.includes('manhã') || turno.includes('matutino')) return 'morning';

            const curso = normalizeString(entry.Curso || '');
            if (curso.includes('resid') || curso.includes('bolsa')) return 'morning';
            if (curso.includes('especializa')) return 'afternoon';

            const escalaNome = normalizeString(entry.Escala || entry.escala || entry.__escalaNome || '');
            if (escalaNome.includes('noite') || escalaNome.includes('nt')) return 'night';
            if (escalaNome.includes('tarde')) return 'afternoon';
            if (escalaNome.includes('manha')) return 'morning';

            return 'flex';
        }


        function escapeHtml(value = '') {
            if (value === null || value === undefined) return '';
            return String(value)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        function sanitizeTime(value = '') {
            const trimmed = value.trim();
            if (!trimmed) return '';
            const parts = trimmed.split(':');
            if (parts.length >= 2) {
                return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`;
            }
            return trimmed;
        }

        function toMinutes(time = '') {
            if (!time) return null;
            const parts = time.split(':');
            if (parts.length < 2) return null;
            const hours = parseInt(parts[0], 10);
            const minutes = parseInt(parts[1], 10);
            if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
            return hours * 60 + minutes;
        }

        function formatDateBR(isoDate = '') {
            if (!isoDate) return '--';
            const [year, month, day] = isoDate.split('-');
            if (!year || !month || !day) return isoDate;
            return `${day}/${month}/${year}`;
        }

        function formatDateLabel(isoDate = '') {
            if (!isoDate) return '--';
            try {
                const date = new Date(`${isoDate}T00:00:00`);
                return date.toLocaleDateString('pt-BR', {
                    weekday: 'long',
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric'
                });
            } catch (error) {
                return formatDateBR(isoDate);
            }
        }

        function convertDateBRToISO(value = '') {
            const sanitized = String(value || '').trim();
            if (!sanitized) return '';
            if (/^\d{4}-\d{2}-\d{2}$/.test(sanitized)) {
                return sanitized;
            }
            const parts = sanitized.split(/[\/-]/);
            if (parts.length !== 3) return '';
            const [day, month, year] = parts;
            if (!day || !month || !year) return '';
            return `${year.padStart(4, '0')}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        }

        function normalizeDateInput(value) {
            if (value instanceof Date && !Number.isNaN(value.getTime())) {
                return value.toISOString().slice(0, 10);
            }
            const str = String(value || '').trim();
            if (!str) return '';
            if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
            if (/^\d{2}[\/-]\d{2}[\/-]\d{4}$/.test(str)) return convertDateBRToISO(str);
            return '';
        }

        function parseAvailableDates(raw) {
            if (!raw) return [];
            let values;
            if (Array.isArray(raw)) {
                values = raw;
            } else if (typeof raw === 'string') {
                values = raw.split(/[;,\s]+/).filter(Boolean);
            } else if (typeof raw === 'object') {
                values = Object.keys(raw);
            } else {
                values = [];
            }
            const isoDates = values
                .map((value) => normalizeDateInput(value))
                .filter(Boolean);
            return Array.from(new Set(isoDates));
        }

        function parseAvailableScales(raw, fallbackDate) {
            const map = new Map();
            if (!raw) return map;

            const ensureList = (value) => {
                if (!value) return [];
                if (Array.isArray(value)) return value;
                if (typeof value === 'object') return Object.values(value);
                return [value];
            };

            if (Array.isArray(raw) || typeof raw === 'string') {
                const iso = normalizeDateInput(fallbackDate);
                if (iso) {
                    const sanitized = ensureList(raw)
                        .map((item) => (item == null ? '' : String(item).trim()))
                        .filter(Boolean);
                    if (sanitized.length) {
                        map.set(iso, Array.from(new Set(sanitized)));
                    }
                }
                return map;
            }

            if (typeof raw === 'object') {
                Object.entries(raw).forEach(([key, value]) => {
                    const iso = normalizeDateInput(key) || normalizeDateInput(fallbackDate);
                    if (!iso) return;
                    const sanitized = ensureList(value)
                        .map((item) => (item == null ? '' : String(item).trim()))
                        .filter(Boolean);
                    if (!sanitized.length) return;
                    const existing = map.get(iso) || [];
                    map.set(iso, Array.from(new Set([...existing, ...sanitized])));
                });
            }

            return map;
        }

        function parseLastUpdated(value) {
            if (!value) return null;
            if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
            const str = String(value).trim();
            if (!str) return null;
            if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
                const iso = str.includes('T') ? str : str.replace(' ', 'T');
                const date = new Date(iso);
                if (!Number.isNaN(date.getTime())) return date;
            }
            const brMatch = str.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})(?:\s+(\d{2}:\d{2}(?::\d{2})?))?/);
            if (brMatch) {
                const [, day, month, year, time = '00:00'] = brMatch;
                const normalizedTime = time.length === 5 ? `${time}:00` : time;
                const date = new Date(`${year}-${month}-${day}T${normalizedTime}`);
                if (!Number.isNaN(date.getTime())) return date;
            }
            const parsed = Date.parse(str);
            return Number.isNaN(parsed) ? null : new Date(parsed);
        }

        function resolvePontoRecords(container) {
            if (!container) return [];
            if (Array.isArray(container)) return container;
            const keys = ['registros', 'records', 'rows', 'lista', 'itens', 'values', 'dados'];
            for (const key of keys) {
                if (Array.isArray(container[key])) {
                    return container[key];
                }
            }
            if (Array.isArray(container.data) && container.data.every((item) => typeof item === 'object')) {
                return container.data;
            }
            if (Array.isArray(container.hoje)) return container.hoje;
            if (container.registrosPorEscala && typeof container.registrosPorEscala === 'object') {
                const aggregated = [];
                Object.values(container.registrosPorEscala).forEach((list) => {
                    if (Array.isArray(list)) aggregated.push(...list);
                });
                if (aggregated.length) return aggregated;
            }
            if (Array.isArray(container.ponto)) return container.ponto;
            return [];
        }

        function extractPontoPayload(response) {
            const root = response || {};
            const container = root.data || root.payload || root.result || root.hoje || root.ponto || root;
            const records = resolvePontoRecords(container);
            const selectedDateRaw = container?.dataISO ?? container?.dataIso ?? container?.DataISO ?? container?.data ?? container?.Data ?? root.dataISO ?? root.data ?? '';
            const selectedScaleRaw = container?.escalaAtual ?? container?.escala ?? container?.Escala ?? container?.escalaSelecionada ?? root.escalaAtual ?? '';
            const availableDates = parseAvailableDates(container?.datasDisponiveis ?? container?.datasISO ?? container?.datas ?? root.datasDisponiveis ?? root.datas);
            const scalesByDate = parseAvailableScales(container?.escalasDisponiveis ?? container?.escalas ?? root.escalasDisponiveis, selectedDateRaw);
            const lastUpdated = parseLastUpdated(container?.lastUpdated ?? container?.ultimaAtualizacao ?? container?.lastSync ?? container?.timestamp ?? root.lastUpdated ?? root.ultimaAtualizacao ?? root.lastSync ?? root.timestamp);

            return {
                records,
                selectedDate: normalizeDateInput(selectedDateRaw),
                selectedScale: typeof selectedScaleRaw === 'string' ? selectedScaleRaw : '',
                availableDates,
                scalesByDate,
                lastUpdated
            };
        }

        function normalizeScaleKey(scale) {
            return (!scale || scale === 'all') ? 'all' : normalizeString(scale);
        }

        function makePontoCacheKey(dateIso, scaleKey) {
            return `${dateIso || 'unknown'}__${scaleKey}`;
        }

        function getPontoRecordKey(row) {
            const datePart = row.isoDate || '';
            const nameKey = row.nomeId || row.id || normalizeString(row.nome || '');
            const serial = row.serialNormalized || normalizeString(row.rawSerial || '');
            const email = row.emailNormalized || (row.email ? normalizeString(row.email) : '');
            const scale = normalizeString(row.escala || '');
            return `${datePart}|${nameKey}|${serial}|${email}|${scale}`;
        }

        function mergeRecordLists(base = [], additions = []) {
            const map = new Map();
            (base || []).forEach((row) => {
                map.set(getPontoRecordKey(row), row);
            });
            (additions || []).forEach((row) => {
                map.set(getPontoRecordKey(row), row);
            });
            return Array.from(map.values());
        }

        function normalizePontoRecord(row = {}, fallbackDate = '') {
            if (!row) return null;
            const nome = row.NomeCompleto || row.Nome || row.nomeCompleto || row.nome || '';
            const candidates = [
                row.DataISO,
                row.dataISO,
                row.dataIso,
                row.dataiso,
                row.DataIso,
                row.data,
                row.Data,
                row.DATA,
                row['Data (ISO)'],
                row['DataISO']
            ];
            let isoDate = '';
            for (const candidate of candidates) {
                const normalized = normalizeDateInput(candidate);
                if (normalized) {
                    isoDate = normalized;
                    break;
                }
            }
            if (!isoDate) {
                isoDate = normalizeDateInput(fallbackDate);
            }
            if (!isoDate) return null;

            const escala = row.Escala || row.escala || row['Escala'] || '';
            const modalidade = row['Pratica/Teorica'] || row['Prática/Teórica'] || row['Pratica/Teórica'] || row['Prática/Teorica'] || row.Modalidade || row.modalidade || '';
            const horaEntradaRaw = (row.HoraEntrada ?? row.Entrada ?? row.horaEntrada ?? '').toString();
            const horaSaidaRaw = (row.HoraSaida ?? row.Saida ?? row.horaSaida ?? '').toString();
            const horaEntrada = sanitizeTime(horaEntradaRaw);
            const horaSaida = sanitizeTime(horaSaidaRaw);
            const rawSerialValue = row.SerialNumber || row.Serial || row.ID || row.Id || '';
            const rawSerial = rawSerialValue !== null && rawSerialValue !== undefined ? String(rawSerialValue) : '';
            const serialNormalized = rawSerial ? normalizeString(rawSerial) : '';
            const emailValue = row.EmailHC || row.Email || row.email || '';
            const email = emailValue || '';
            const emailNormalized = email ? normalizeString(email) : '';
            const nomeId = normalizeString(nome);
            const primaryId = nomeId || serialNormalized || emailNormalized || '';

            return {
                id: primaryId,
                nomeId,
                rawSerial,
                serialNormalized,
                nome,
                isoDate,
                dataBr: formatDateBR(isoDate),
                escala,
                modalidade,
                horaEntrada,
                horaSaida,
                horaEntradaMinutes: toMinutes(horaEntradaRaw || horaEntrada),
                escalaKey: normalizeString(escala || 'sem-escala'),
                email,
                emailNormalized
            };
        }

        function applyPontoData(records = [], {
            targetDate = '',
            scale = 'all',
            availableDates = [],
            scalesByDate = new Map(),
            lastUpdated = null,
            updateSelection = false,
            replaceExisting = false
        } = {}) {
            const normalizedDate = normalizeDateInput(targetDate);
            const scaleLabel = scale || 'all';
            const scaleKey = normalizeScaleKey(scaleLabel);
            const processed = (records || []).map((row) => normalizePontoRecord(row, normalizedDate)).filter(Boolean);
            const grouped = new Map();

            if (!processed.length && normalizedDate) {
                grouped.set(normalizedDate, []);
            }

            processed.forEach((entry) => {
                const iso = entry.isoDate || normalizedDate;
                if (!iso) return;
                if (!grouped.has(iso)) grouped.set(iso, []);
                grouped.get(iso).push(entry);
            });

            grouped.forEach((rows, iso) => {
                const existingAll = pontoState.byDate.get(iso) || [];
                let mergedAll;

                if (replaceExisting) {
                    if (scaleKey === 'all') {
                        mergedAll = rows.slice();
                        pontoState.byDate.set(iso, mergedAll);
                        Array.from(pontoState.cache.keys()).forEach((key) => {
                            if (key.startsWith(`${iso}__`)) {
                                pontoState.cache.delete(key);
                            }
                        });
                    } else {
                        const filteredAll = existingAll.filter((row) => normalizeScaleKey(row.escala || 'sem-escala') !== scaleKey);
                        mergedAll = mergeRecordLists(filteredAll, rows);
                        pontoState.byDate.set(iso, mergedAll);
                        pontoState.cache.delete(makePontoCacheKey(iso, scaleKey));
                    }
                } else {
                    mergedAll = scaleKey === 'all' ? rows.slice() : mergeRecordLists(existingAll, rows);
                    pontoState.byDate.set(iso, mergedAll);
                }

                if (!mergedAll) {
                    mergedAll = scaleKey === 'all' ? rows.slice() : mergeRecordLists(existingAll, rows);
                    pontoState.byDate.set(iso, mergedAll);
                }

                pontoState.cache.set(makePontoCacheKey(iso, 'all'), mergedAll);
                if (scaleKey !== 'all') {
                    pontoState.cache.set(makePontoCacheKey(iso, scaleKey), rows.slice());
                }
            });

            const dateSet = new Set(pontoState.dates);
            (availableDates || []).forEach((dateValue) => {
                const iso = normalizeDateInput(dateValue);
                if (iso) dateSet.add(iso);
            });
            grouped.forEach((_, iso) => {
                if (iso) dateSet.add(iso);
            });
            if (normalizedDate) {
                dateSet.add(normalizedDate);
            }
            pontoState.dates = Array.from(dateSet).filter(Boolean).sort((a, b) => b.localeCompare(a));

            if (!(scalesByDate instanceof Map)) {
                scalesByDate = parseAvailableScales(scalesByDate, normalizedDate);
            }

            scalesByDate.forEach((list, dateKey) => {
                const iso = normalizeDateInput(dateKey);
                if (!iso) return;
                const existing = new Set(pontoState.scalesByDate.get(iso) || []);
                (list || []).forEach((item) => {
                    if (item && typeof item === 'string') existing.add(item);
                });
                pontoState.scalesByDate.set(iso, Array.from(existing).sort((a, b) => a.localeCompare(b, 'pt-BR')));
            });

            grouped.forEach((rows, iso) => {
                const existing = new Set(pontoState.scalesByDate.get(iso) || []);
                rows.forEach((row) => {
                    if (row.escala && row.escala.trim()) existing.add(row.escala);
                });
                if (scaleKey !== 'all' && scaleLabel) {
                    existing.add(scaleLabel);
                }
                pontoState.scalesByDate.set(iso, Array.from(existing).sort((a, b) => a.localeCompare(b, 'pt-BR')));
            });

            pontoState.rawRows = Array.from(pontoState.byDate.values()).flat();
            pontoState.lastLoadedAt = lastUpdated || new Date();

            if (updateSelection) {
                if (normalizedDate) {
                    pontoState.selectedDate = normalizedDate;
                    pontoState.autoScaleByDate.set(normalizedDate, scaleLabel || 'all');
                }
                pontoState.selectedScale = scaleLabel || 'all';
            } else {
                if (!pontoState.selectedDate && normalizedDate) {
                    pontoState.selectedDate = normalizedDate;
                }
                if (normalizedDate && scaleKey !== 'all' && scaleLabel && !pontoState.autoScaleByDate.has(normalizedDate)) {
                    pontoState.autoScaleByDate.set(normalizedDate, scaleLabel);
                }
                if (!pontoState.selectedScale) {
                    pontoState.selectedScale = 'all';
                }
            }

            updatePontoHojeMap();
        }

        function getPontoRecords(date, scale = 'all') {
            const iso = normalizeDateInput(date);
            if (!iso) return [];
            const scaleKey = normalizeScaleKey(scale);
            const cacheKey = makePontoCacheKey(iso, scaleKey);
            if (pontoState.cache.has(cacheKey)) {
                return pontoState.cache.get(cacheKey);
            }
            if (scaleKey === 'all') {
                const base = pontoState.byDate.get(iso) || [];
                pontoState.cache.set(cacheKey, base);
                return base;
            }
            const base = pontoState.byDate.get(iso) || [];
            const filtered = base.filter((row) => normalizeString(row.escala || 'sem-escala') === scaleKey);
            pontoState.cache.set(cacheKey, filtered);
            return filtered;
        }

        function hasCachedPontoData(date, scale = 'all') {
            const iso = normalizeDateInput(date);
            if (!iso) return false;
            const scaleKey = normalizeScaleKey(scale);
            if (scaleKey === 'all') {
                return pontoState.cache.has(makePontoCacheKey(iso, 'all')) || pontoState.byDate.has(iso);
            }
            return pontoState.cache.has(makePontoCacheKey(iso, scaleKey));
        }

        function updatePontoHojeMap() {
            const todayISO = new Date().toISOString().slice(0, 10);
            appState.pontoHojeMap.clear();
            if (!appState.pontoHojeAliases) {
                appState.pontoHojeAliases = new Map();
            } else {
                appState.pontoHojeAliases.clear();
            }

            let todaysRows = getPontoRecords(todayISO, 'all');
            if (!todaysRows.length) {
                const scaleList = pontoState.scalesByDate.get(todayISO) || [];
                todaysRows = scaleList.flatMap((scale) => getPontoRecords(todayISO, scale));
            }

            todaysRows.forEach((row) => {
                const primaryKey = row.nomeId || row.id || row.serialNormalized || row.emailNormalized;
                if (!primaryKey) return;

                const entry = {
                    NomeCompleto: row.nome,
                    NomeID: row.nomeId || '',
                    Email: row.email || '',
                    EmailNormalizado: row.emailNormalized || '',
                    SerialNumber: row.rawSerial || '',
                    SerialNormalizado: row.serialNormalized || '',
                    HoraEntrada: row.horaEntrada,
                    HoraSaida: row.horaSaida,
                    Escala: row.escala,
                    Modalidade: row.modalidade || '',
                    DataISO: row.isoDate
                };

                appState.pontoHojeMap.set(primaryKey, entry);

                const aliasKeys = collectPontoIdentityAliases(row, primaryKey);
                aliasKeys.forEach((aliasKey) => {
                    if (!appState.pontoHojeAliases.has(aliasKey)) {
                        appState.pontoHojeAliases.set(aliasKey, primaryKey);
                    }
                });
            });
        }

        function collectPontoIdentityAliases(row = {}, primaryKey = '') {
            const aliases = new Set();
            const addAlias = (value) => {
                const normalized = normalizeString(value);
                if (!normalized || normalized === primaryKey) return;
                aliases.add(normalized);
            };

            addAlias(row.nomeId || row.nome);
            addAlias(row.email);
            addAlias(row.emailNormalized);
            addAlias(row.rawSerial);
            addAlias(row.serialNormalized);

            return Array.from(aliases);
        }

        function resolvePontoHojeRecordByKey(rawKey) {
            const normalized = normalizeString(rawKey);
            if (!normalized) return null;
            if (appState.pontoHojeMap.has(normalized)) {
                return appState.pontoHojeMap.get(normalized);
            }
            const aliasKey = appState.pontoHojeAliases?.get(normalized);
            if (aliasKey && appState.pontoHojeMap.has(aliasKey)) {
                return appState.pontoHojeMap.get(aliasKey);
            }
            return null;
        }

        function resolvePontoHojeRecordFromIdentity({ normName, normEmail, normSerial } = {}) {
            const keys = [normName, normEmail, normSerial];
            for (const key of keys) {
                const record = resolvePontoHojeRecordByKey(key);
                if (record) return record;
            }
            return null;
        }

        function hydratePontoSelectors() {
            const dateInput = document.getElementById('ponto-date-picker');
            const datalist = document.getElementById('ponto-date-options');
            const searchInput = document.getElementById('ponto-search-input');

            if (searchInput) {
                searchInput.value = pontoState.searchRaw || '';
            }

            if (dateInput) {
                if (pontoState.dates.length > 0) {
                    const sortedDates = [...pontoState.dates].sort((a, b) => a.localeCompare(b));
                    dateInput.min = sortedDates[0];
                    dateInput.max = sortedDates[sortedDates.length - 1];
                }
                if (pontoState.selectedDate) {
                    dateInput.value = pontoState.selectedDate;
                }
            }

            if (datalist) {
                datalist.innerHTML = pontoState.dates
                    .slice()
                    .sort((a, b) => b.localeCompare(a))
                    .map((date) => `<option value="${date}">${formatDateBR(date)}</option>`)
                    .join('');
            }

            document.querySelectorAll('#ponto-filter-bar .escala-pill').forEach((pill) => {
                const filter = pill.getAttribute('data-filter');
                pill.classList.toggle('active', filter === pontoState.filter);
            });

            updatePontoScaleOptions();
            updateDateNavigationButtons();
        }

        function updatePontoScaleOptions() {
            const select = document.getElementById('ponto-scale-select');
            if (!select) return;

            const availableScales = pontoState.scalesByDate.get(pontoState.selectedDate) || [];
            let options = '<option value="all">Todas as escalas</option>';
            availableScales.forEach((scaleName) => {
                const safe = escapeHtml(scaleName);
                options += `<option value="${safe}">${safe}</option>`;
            });

            select.innerHTML = options;
            if (pontoState.selectedScale !== 'all') {
                const normalizedSelected = normalizeString(pontoState.selectedScale);
                const normalizedAvailable = availableScales.map((item) => normalizeString(item));
                if (!normalizedAvailable.includes(normalizedSelected)) {
                    pontoState.selectedScale = 'all';
                }
            }
            select.value = pontoState.selectedScale || 'all';
        }

        function enrichPontoRows(rows = []) {
            const baselineByScale = new Map();
            rows.forEach((row) => {
                if (Number.isFinite(row.horaEntradaMinutes)) {
                    const current = baselineByScale.get(row.escalaKey);
                    baselineByScale.set(row.escalaKey, current === undefined ? row.horaEntradaMinutes : Math.min(current, row.horaEntradaMinutes));
                }
            });

            return rows.map((row) => {
                const baseline = baselineByScale.get(row.escalaKey);
                let status = 'absent';
                let statusLabel = 'Falta';
                let badgeClass = 'badge badge-red';
                let delayMinutes = null;

                if (Number.isFinite(row.horaEntradaMinutes)) {
                    if (baseline !== undefined && baseline !== null) {
                        const diff = Math.max(0, row.horaEntradaMinutes - baseline);
                        delayMinutes = diff;
                        if (diff > ATRASO_THRESHOLD_MINUTES) {
                            status = 'late';
                            statusLabel = diff ? `Atraso (+${diff} min)` : 'Atraso';
                            badgeClass = 'badge badge-yellow';
                        } else {
                            status = 'present';
                            statusLabel = 'Presente';
                            badgeClass = 'badge badge-green';
                        }
                    } else {
                        status = 'present';
                        statusLabel = 'Presente';
                        badgeClass = 'badge badge-green';
                    }
                }

                const searchKey = normalizeString([
                    row.nome,
                    row.escala,
                    row.modalidade,
                    row.horaEntrada,
                    row.horaSaida,
                    row.email,
                    row.rawSerial,
                    statusLabel
                ].filter(Boolean).join(' '));

                return {
                    ...row,
                    status,
                    statusLabel,
                    badgeClass,
                    delayMinutes,
                    searchKey,
                    dataBR: formatDateBR(row.isoDate)
                };
            });
        }

        function refreshPontoView() {
            try {
                const dataset = buildPontoDataset(pontoState.selectedDate, pontoState.selectedScale);
                const enriched = dataset.rows || [];
                const presentCount = enriched.filter((row) => row.status === 'present' || row.status === 'late').length;
                const lateCount = enriched.filter((row) => row.status === 'late').length;
                const absentCount = enriched.filter((row) => row.status === 'absent').length;
                const totalEscalados = Math.max(dataset.rosterSize || 0, enriched.length || 0, TOTAL_ESCALADOS);

                updatePontoSummary({
                    total: totalEscalados,
                    present: presentCount,
                    late: lateCount,
                    absent: absentCount
                });
                updatePontoFilterCounters(enriched);

                const searchTerm = pontoState.search || '';
                const filter = pontoState.filter || 'all';
                const filteredRows = enriched.filter((row) => {
                    let matchesFilter = filter === 'all';
                    if (!matchesFilter) {
                        if (filter === 'present') {
                            matchesFilter = row.status === 'present' || row.status === 'late';
                        } else {
                            matchesFilter = row.status === filter;
                        }
                    }
                    const matchesSearch = !searchTerm || row.searchKey.includes(searchTerm);
                    return matchesFilter && matchesSearch;
                });

                renderPontoTable(filteredRows, enriched.length, (dataset.baseRecords || []).length);
                updatePontoMeta();
                renderEscalaOverview();
                updateDateNavigationButtons();
            } catch (error) {
                console.error('[refreshPontoView] Erro ao atualizar painel de ponto:', error);
                showError('Erro ao atualizar o painel de ponto.');
            }
        }

        function renderEscalaOverview() {
            const grid = document.getElementById('escala-overview-grid');
            const emptyState = document.getElementById('escala-overview-empty');
            const statsContainer = document.getElementById('escala-overview-stats');
            const dateLabel = document.getElementById('escala-overview-date');

            if (!grid || !emptyState || !statsContainer || !dateLabel) return;

            const targetDate = normalizeDateInput(pontoState.selectedDate) || new Date().toISOString().slice(0, 10);
            dateLabel.textContent = formatDateLabel(targetDate);

            const dataset = buildPontoDataset(targetDate, 'all');
            const rosterEntries = dataset.rosterEntries || [];
            const lookup = buildPontoRowLookup(dataset.rows || []);

            const counts = {
                total: Math.max(rosterEntries.length || 0, (dataset.rows || []).length || 0, TOTAL_ESCALADOS),
                present: 0,
                late: 0,
                absent: 0
            };

            if (!rosterEntries.length) {
                grid.innerHTML = '';
                emptyState.hidden = false;
                emptyState.querySelector('p').textContent = 'Nenhuma escala encontrada para a data selecionada.';
                statsContainer.innerHTML = `
                    <div class="escala-stat-card">
                        <span class="label">Escalados</span>
                        <span class="value">${TOTAL_ESCALADOS}</span>
                    </div>
                    <div class="escala-stat-card is-green">
                        <span class="label">Presentes</span>
                        <span class="value">0</span>
                    </div>
                    <div class="escala-stat-card is-amber">
                        <span class="label">Atrasos</span>
                        <span class="value">0</span>
                    </div>
                    <div class="escala-stat-card is-red">
                        <span class="label">Faltas</span>
                        <span class="value">${TOTAL_ESCALADOS}</span>
                    </div>
                `;
                return;
            }

            const groups = {
                morning: [],
                afternoon: [],
                night: [],
                flex: []
            };

            const sortedRoster = rosterEntries.slice().sort((a, b) => {
                const nameA = (a.NomeCompleto || a.nome || '').toLocaleLowerCase('pt-BR');
                const nameB = (b.NomeCompleto || b.nome || '').toLocaleLowerCase('pt-BR');
                return nameA.localeCompare(nameB, 'pt-BR');
            });

            sortedRoster.forEach((entry) => {
                const keys = entry.__normalizedKeys || {};
                const possibleKeys = [
                    keys.nomeId,
                    keys.email,
                    keys.serial,
                    entry.EmailHC,
                    entry.NomeCompleto,
                    entry.SerialNumber
                ];

                let matchedRow = null;
                for (const candidate of possibleKeys) {
                    const normalized = normalizeString(candidate);
                    if (normalized && lookup.has(normalized)) {
                        matchedRow = lookup.get(normalized);
                        break;
                    }
                }

                const slot = determineRosterSlot(entry);
                const bucket = groups[slot] ? slot : 'flex';
                const status = matchedRow ? matchedRow.status : 'absent';
                if (status === 'present') {
                    counts.present += 1;
                } else if (status === 'late') {
                    counts.present += 1;
                    counts.late += 1;
                } else {
                    counts.absent += 1;
                }

                groups[bucket].push({
                    nome: entry.NomeCompleto || entry.nome || '—',
                    email: entry.EmailHC || entry.Email || entry.email || '',
                    curso: entry.Curso || '',
                    escala: entry.__escalaNome || matchedRow?.escala || '',
                    status: matchedRow ? matchedRow.status : 'absent',
                    statusLabel: matchedRow ? matchedRow.statusLabel : 'Falta',
                    badgeClass: matchedRow ? matchedRow.badgeClass : 'badge badge-red',
                    horaEntrada: matchedRow?.horaEntrada || '',
                    horaSaida: matchedRow?.horaSaida || ''
                });
            });

            counts.absent = Math.max(counts.absent, Math.max(counts.total - counts.present, 0));

            statsContainer.innerHTML = `
                <div class="escala-stat-card">
                    <span class="label">Escalados</span>
                    <span class="value">${counts.total}</span>
                </div>
                <div class="escala-stat-card is-green">
                    <span class="label">Presentes</span>
                    <span class="value">${counts.present}</span>
                </div>
                <div class="escala-stat-card is-amber">
                    <span class="label">Atrasos</span>
                    <span class="value">${counts.late}</span>
                </div>
                <div class="escala-stat-card is-red">
                    <span class="label">Faltas</span>
                    <span class="value">${counts.absent}</span>
                </div>
            `;

            const groupMeta = {
                morning: { title: 'Turno da Manhã', description: 'Bolsistas e residentes', hours: '08h às 13h' },
                afternoon: { title: 'Turno da Tarde', description: 'Especialização paga', hours: '13h às 18h' },
                night: { title: 'Turno Noturno', description: 'Conforme escala vigente', hours: 'Horário flexível' },
                flex: { title: 'Outros Turnos', description: 'Plantões e ajustes', hours: 'Definido na escala' }
            };

            const order = ['morning', 'afternoon', 'night', 'flex'];
            const sections = order.map((key) => {
                const items = groups[key];
                if (!items || !items.length) return '';
                const meta = groupMeta[key];
                const listItems = items.map((item) => {
                    const extraParts = [];
                    if (item.curso) extraParts.push(item.curso);
                    if (item.escala) extraParts.push(item.escala);
                    const extraMarkup = extraParts.length
                        ? `<span class="escala-person-extra">${escapeHtml(extraParts.join(' • '))}</span>`
                        : '';
                    const hours = item.horaEntrada
                        ? `<span class="escala-person-hours">${escapeHtml(item.horaEntrada)}${item.horaSaida ? ` – ${escapeHtml(item.horaSaida)}` : ''}</span>`
                        : '';

                    return `
                        <li class="escala-person">
                            <div class="escala-person-info">
                                <span class="escala-person-name">${escapeHtml(item.nome)}</span>
                                ${item.email ? `<span class="escala-person-email">${escapeHtml(item.email)}</span>` : ''}
                                ${extraMarkup}
                            </div>
                            <div class="escala-person-status">
                                <span class="${item.badgeClass}">${escapeHtml(item.statusLabel)}</span>
                                ${hours}
                            </div>
                        </li>
                    `;
                }).join('');

                return `
                    <section class="escala-column">
                        <header>
                            <div>
                                <h3>${escapeHtml(meta.title)}</h3>
                                <p>${escapeHtml(meta.description)}</p>
                            </div>
                            <span class="escala-column-hours">${escapeHtml(meta.hours)}</span>
                        </header>
                        <ul>${listItems}</ul>
                    </section>
                `;
            }).filter(Boolean).join('');

            grid.innerHTML = sections;
            emptyState.hidden = Boolean(sections);
            if (!sections) {
                emptyState.querySelector('p').textContent = 'Nenhum profissional escalado para esta data.';
            }
        }

        function updatePontoSummary(counts = {}) {
            const mappings = [
                ['ponto-count-total', counts.total || 0],
                ['ponto-count-present', counts.present || 0],
                ['ponto-count-late', counts.late || 0],
                ['ponto-count-absent', counts.absent || 0]
            ];
            mappings.forEach(([id, value]) => {
                const element = document.getElementById(id);
                if (element) element.textContent = value;
            });
        }

        function updatePontoFilterCounters(rows = []) {
            const counters = {
                'ponto-filter-total': rows.length,
                'ponto-filter-present': rows.filter((row) => row.status === 'present' || row.status === 'late').length,
                'ponto-filter-late': rows.filter((row) => row.status === 'late').length,
                'ponto-filter-absent': rows.filter((row) => row.status === 'absent').length
            };

            Object.entries(counters).forEach(([id, value]) => {
                const element = document.getElementById(id);
                if (element) element.textContent = value;
            });
        }

        function renderPontoTable(rows = [], enrichedCount = 0, totalBase = 0) {
            const tbody = document.getElementById('ponto-table-body');
            const emptyState = document.getElementById('ponto-empty-state');
            if (!tbody || !emptyState) return;

            if (rows.length === 0) {
                tbody.innerHTML = '';
                emptyState.hidden = false;
                const message = emptyState.querySelector('p');
                if (message) {
                    if (totalBase === 0) {
                        message.textContent = pontoState.selectedDate
                            ? `Nenhum registro encontrado para ${formatDateBR(pontoState.selectedDate)}.`
                            : 'Nenhum registro disponível.';
                    } else if (enrichedCount === 0) {
                        message.textContent = 'Nenhum registro disponível para a escala selecionada.';
                    } else {
                        message.textContent = 'Nenhum registro encontrado para os filtros selecionados.';
                    }
                }
                return;
            }

            emptyState.hidden = true;
            tbody.innerHTML = rows.map(renderPontoRow).join('');
        }

        function renderPontoRow(row) {
            const initials = getInitials(row.nome);
            const escalaContent = row.escala && row.escala.trim().length > 0
                ? `<span class="ponto-escala-pill">${escapeHtml(row.escala)}</span>`
                : '<span class="ponto-escala-pill">Sem escala</span>';
            const modalidadeContent = row.modalidade && row.modalidade.trim().length > 0
                ? `<span class="ponto-modalidade">${escapeHtml(row.modalidade)}</span>`
                : '<span class="ponto-modalidade">—</span>';
            const emailLine = row.email ? `<span class="ponto-person-email">${escapeHtml(row.email)}</span>` : '';
            const serialLine = row.rawSerial ? `<span class="ponto-person-extra">Crachá: ${escapeHtml(row.rawSerial)}</span>` : '';

            return `
                <tr class="ponto-row" data-status="${row.status}" data-search="${row.searchKey}">
                    <td data-label="Nome">
                        <div class="ponto-person">
                            <div class="ponto-avatar">${escapeHtml(initials)}</div>
                            <div class="ponto-person-info">
                                <span class="ponto-person-name">${escapeHtml(row.nome || '—')}</span>
                                ${emailLine}
                                ${serialLine}
                            </div>
                        </div>
                    </td>
                    <td data-label="Data">${escapeHtml(row.dataBR)}</td>
                    <td data-label="Hora de Entrada">${escapeHtml(row.horaEntrada || '—')}</td>
                    <td data-label="Hora de Saída">${escapeHtml(row.horaSaida || '—')}</td>
                    <td data-label="Escala">
                        <div class="ponto-escala-cell">
                            ${escalaContent}
                            <span class="${row.badgeClass}">${escapeHtml(row.statusLabel)}</span>
                        </div>
                    </td>
                    <td data-label="Prática/Teórica">${modalidadeContent}</td>
                </tr>`;
        }

        function updatePontoMeta() {
            const dateLabel = document.getElementById('ponto-active-date');
            if (dateLabel) {
                dateLabel.textContent = pontoState.selectedDate ? formatDateLabel(pontoState.selectedDate) : '--';
            }
            const syncLabel = document.getElementById('ponto-last-sync');
                const totalDates = pontoState.dates.length;
                const dateInfo = totalDates > 1 ? ` • ${totalDates} datas disponíveis` : '';
                const timeInfo = pontoState.lastLoadedAt
                    ? `Atualizado ${pontoState.lastLoadedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
                    : 'Dados não carregados';
                syncLabel.textContent = timeInfo + dateInfo;
            }
        }

        function handlePontoFilterClick(event) {
            const button = event.target.closest('.escala-pill');
            if (!button) return;
            const filter = button.getAttribute('data-filter');
            if (!filter) return;

            pontoState.filter = filter;
            document.querySelectorAll('#ponto-filter-bar .escala-pill').forEach((pill) => {
                pill.classList.toggle('active', pill === button);
            });
            refreshPontoView();
        }

        function handlePontoSearch(event) {
            const value = event.target.value || '';
            pontoState.searchRaw = value;
            pontoState.search = normalizeString(value);
            refreshPontoView();
        }

        async function handlePontoDateChange(event) {
            const isoValue = normalizeDateInput(event.target.value);
            if (!isoValue) return;
            const isSameDate = isoValue === pontoState.selectedDate;
            pontoState.selectedDate = isoValue;
            pontoState.selectedScale = 'all';
            pontoState.filter = 'all';
            pontoState.search = '';
            pontoState.searchRaw = '';
            if (!isSameDate || !hasCachedPontoData(isoValue, 'all')) {
                await ensurePontoData(isoValue, 'all', { showInlineSpinner: true });
            }
            hydratePontoSelectors();
            refreshPontoView();
        }

        async function handlePontoScaleChange(event) {
            const scaleValue = event.target.value || 'all';
            if (scaleValue === pontoState.selectedScale) return;
            pontoState.selectedScale = scaleValue;
            pontoState.filter = 'all';
            const currentDate = pontoState.selectedDate;
            if (currentDate) {
                if (!hasCachedPontoData(currentDate, scaleValue)) {
                    await ensurePontoData(currentDate, scaleValue, { showInlineSpinner: true });
                }
            }
            hydratePontoSelectors();
            refreshPontoView();
        }

        async function handlePontoPrevDate() {
            if (!pontoState.dates || pontoState.dates.length === 0) return;
            
            const currentIndex = pontoState.dates.indexOf(pontoState.selectedDate);
            if (currentIndex === -1 || currentIndex >= pontoState.dates.length - 1) return;
            
            const prevDate = pontoState.dates[currentIndex + 1];
            pontoState.selectedDate = prevDate;
            pontoState.selectedScale = 'all';
            pontoState.filter = 'all';
            pontoState.search = '';
            pontoState.searchRaw = '';
            
            await ensurePontoData(prevDate, 'all', { showInlineSpinner: true });
            hydratePontoSelectors();
            refreshPontoView();
            updateDateNavigationButtons();
        }

        async function handlePontoNextDate() {
            if (!pontoState.dates || pontoState.dates.length === 0) return;
            
            const currentIndex = pontoState.dates.indexOf(pontoState.selectedDate);
            if (currentIndex <= 0) return;
            
            const nextDate = pontoState.dates[currentIndex - 1];
            pontoState.selectedDate = nextDate;
            pontoState.selectedScale = 'all';
            pontoState.filter = 'all';
            pontoState.search = '';
            pontoState.searchRaw = '';
            
            await ensurePontoData(nextDate, 'all', { showInlineSpinner: true });
            hydratePontoSelectors();
            refreshPontoView();
            updateDateNavigationButtons();
        }

        function updateDateNavigationButtons() {
            const prevButton = document.getElementById('ponto-prev-date');
            const nextButton = document.getElementById('ponto-next-date');
            
            if (!prevButton || !nextButton || !pontoState.dates || pontoState.dates.length === 0) return;
            
            const currentIndex = pontoState.dates.indexOf(pontoState.selectedDate);
            
            prevButton.disabled = currentIndex === -1 || currentIndex >= pontoState.dates.length - 1;
            nextButton.disabled = currentIndex <= 0;
        }

        async function handlePontoRefresh() {
            const todayISO = new Date().toISOString().slice(0, 10);
            const dateIso = normalizeDateInput(pontoState.selectedDate) || todayISO;
            const scaleLabel = pontoState.selectedScale || 'all';
            const autoScale = pontoState.autoScaleByDate.get(dateIso);
            const autoScaleKey = autoScale ? normalizeScaleKey(autoScale) : 'all';
            const currentScaleKey = normalizeScaleKey(scaleLabel);
            const useTodayEndpointAll = dateIso === todayISO && (currentScaleKey === 'all' || currentScaleKey === autoScaleKey);

            await ensurePontoData(dateIso, 'all', {
                showInlineSpinner: true,
                useTodayEndpoint: useTodayEndpointAll,
                forceReload: true,
                replaceExisting: true
            });

            if (scaleLabel !== 'all') {
                const useTodayEndpointScale = dateIso === todayISO && currentScaleKey === autoScaleKey;
                await ensurePontoData(dateIso, scaleLabel, {
                    showInlineSpinner: false,
                    useTodayEndpoint: useTodayEndpointScale,
                    forceReload: true,
                    replaceExisting: true
                });
            }

            hydratePontoSelectors();
            refreshPontoView();
        }

        async function loadPontoData({ date, scale = 'all', showInlineSpinner = false, useTodayEndpoint = false, adoptSelection = false, replaceExisting = false } = {}) {
            const normalizedDate = normalizeDateInput(date);
            const scaleLabel = scale || 'all';
            const scaleKey = normalizeScaleKey(scaleLabel);
            const loadingBanner = document.getElementById('ponto-loading-state');
            if (loadingBanner) {
                loadingBanner.hidden = false;
                loadingBanner.textContent = showInlineSpinner ? 'Atualizando registros do ponto...' : 'Carregando registros do ponto...';
            }

            if (pontoState.isLoading) {
                console.warn('[loadPontoData] Requisição anterior ainda está em andamento.');
            }
            pontoState.isLoading = true;

            try {
                const url = new URL(API_URL);
                if (useTodayEndpoint) {
                    url.searchParams.set('action', 'getPontoHoje_');
                } else {
                    url.searchParams.set('action', 'getPontoPorEscala_');
                    if (normalizedDate) {
                        url.searchParams.set('data', normalizedDate);
                    }
                    if (scaleKey !== 'all') {
                        url.searchParams.set('escala', scaleLabel);
                    }
                }

                const response = await fetch(url.toString());
                if (!response.ok) {
                    throw new Error(`Rede (${url.searchParams.get('action')}): ${response.statusText} (${response.status})`);
                }

                const json = await response.json();
                if (json && json.success === false) {
                    throw new Error(json.error || 'Resposta inválida do backend.');
                }

                const payload = extractPontoPayload(json);
                const resolvedDate = payload.selectedDate || normalizedDate || (payload.availableDates[0] || '');
                const resolvedScale = payload.selectedScale || scaleLabel || 'all';
                const lastUpdated = payload.lastUpdated || new Date();

                applyPontoData(payload.records || [], {
                    targetDate: resolvedDate,
                    scale: resolvedScale,
                    availableDates: payload.availableDates,
                    scalesByDate: payload.scalesByDate,
                    lastUpdated,
                    updateSelection: adoptSelection,
                    replaceExisting
                });

                console.log(`[loadPontoData] Carregados ${(payload.records || []).length} registros (${resolvedScale || 'all'}) para ${resolvedDate || 'sem-data'}.`);

                return { success: true, selectedDate: resolvedDate, selectedScale: resolvedScale };
            } catch (error) {
                console.error('[loadPontoData] Erro ao carregar dados de ponto:', error);
                showError(`Falha ao carregar dados de ponto: ${error.message}`);
                throw error;
            } finally {
                pontoState.isLoading = false;
                if (loadingBanner) {
                    loadingBanner.hidden = true;
                }
            }
        }

        async function ensurePontoData(date, scale = 'all', { showInlineSpinner = false, useTodayEndpoint = false, adoptSelection = false, forceReload = false, replaceExisting = false } = {}) {
            const isoDate = normalizeDateInput(date);
            const scaleLabel = scale || 'all';
            if (!forceReload && isoDate && hasCachedPontoData(isoDate, scaleLabel)) {
                return { success: true, cached: true, selectedDate: isoDate, selectedScale: scaleLabel };
            }
            try {
                if (forceReload && isoDate) {
                    if (scaleLabel === 'all') {
                        pontoState.byDate.delete(isoDate);
                        Array.from(pontoState.cache.keys()).forEach((key) => {
                            if (key.startsWith(`${isoDate}__`)) {
                                pontoState.cache.delete(key);
                            }
                        });
                    } else {
                        pontoState.cache.delete(makePontoCacheKey(isoDate, scaleLabel));
                    }
                }
                return await loadPontoData({
                    date: isoDate,
                    scale: scaleLabel,
                    showInlineSpinner,
                    useTodayEndpoint,
                    adoptSelection,
                    replaceExisting: replaceExisting || forceReload
                });
            } catch (error) {
                console.error('[ensurePontoData] Falha ao garantir dados de ponto:', error);
                return null;
            }
        }

        async function initializePontoPanel() {
            const todayISO = new Date().toISOString().slice(0, 10);
            const result = await ensurePontoData(todayISO, 'all', { useTodayEndpoint: true, adoptSelection: true });
            if (result && result.selectedDate) {
                pontoState.selectedDate = result.selectedDate;
            } else if (!pontoState.selectedDate) {
                pontoState.selectedDate = todayISO;
            }
            if (result && result.selectedScale) {
                pontoState.selectedScale = result.selectedScale;
            } else if (!pontoState.selectedScale) {
                pontoState.selectedScale = 'all';
            }
            if (!pontoState.dates.includes(pontoState.selectedDate)) {
                pontoState.dates.push(pontoState.selectedDate);
                pontoState.dates.sort((a, b) => b.localeCompare(a));
            }
            hydratePontoSelectors();
            refreshPontoView();
        }

        function renderStudentList(students) {
             try {
                 const panel = document.getElementById('student-list-panel'); 
                 if (!panel) return;
                 
                 if (!students || students.length === 0) { panel.innerHTML = '<p class="text-slate-500 p-6 text-center">Nenhum aluno.</p>'; return; } 
                 
                 const grouped = students.reduce((acc, s) => { const c = s.Curso || 'Sem Curso'; if (!acc[c]) acc[c] = []; acc[c].push(s); return acc; }, {}); 
                 const courses = Object.keys(grouped).sort((a, b) => a.localeCompare(b));
                 
                 let html = ''; 
                 courses.forEach(c => { 
                     html += `<div class="student-group" data-course="${c}"><h3 class="student-group-header">${c} (${grouped[c].length})</h3><div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 p-1">`; 
                     
                     grouped[c].sort((a,b) => a.NomeCompleto.localeCompare(b.NomeCompleto)).forEach(s => { 
                         const img = s.FotoID ? `https://lh3.googleusercontent.com/d/${s.FotoID}=s96-c` : 'https://placehold.co/60x60/e2e8f0/64748b?text=?'; 
                         const inactive = s.Status !== 'Ativo'; 
                         const inactiveClass = inactive ? 'inactive-card' : ''; 
                         const inactiveBadge = inactive ? '<span class="badge badge-red inactive-badge">Inativo</span>' : ''; 
                         
                         // [ORION] Removido 'onclick' do HTML.
                         html += `<div class="student-card ${inactiveClass}" data-student-email="${s.EmailHC}" data-student-name="${normalizeString(s.NomeCompleto)}">
                                      ${inactiveBadge}
                                      <img src="${img}" alt="Foto" onerror="this.src='https://placehold.co/60x60/e2e8f0/64748b?text=?'">
                                      <p class="student-name">${s.NomeCompleto}</p>
                                      <p class="student-course mt-0.5">${s.Curso}</p>
                                  </div>`; 
                     }); 
                     html += `</div></div>`; 
                 }); 
                 panel.innerHTML = html;
             } catch (e) { console.error("[renderStudentList] Erro:", e); showError("Erro ao renderizar lista de alunos."); }
        }

        function filterStudentList(e) {
            const q = normalizeString(e.target.value);
            const groups = document.querySelectorAll('.student-group');
            let hasVisible = false;
            
            groups.forEach(g => {
                const cards = g.querySelectorAll('.student-card');
                const header = g.querySelector('.student-group-header');
                let groupVisible = false;
                
                cards.forEach(c => {
                    const nameElem = c.querySelector('.student-name');
                    const name = c.getAttribute('data-student-name'); 
                    const originalName = nameElem.textContent; 
                    
                    if (q === '' || name.includes(q)) {
                        c.classList.remove('hidden');
                        groupVisible = true;
                        hasVisible = true;
                        if (q !== '') {
                            try {
                                const regex = new RegExp(`(${q.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')})`, 'gi');
                                nameElem.innerHTML = originalName.replace(regex, '<span class="highlight">$1</span>');
                            } catch (err) {
                                nameElem.innerHTML = originalName; 
                            }
                        } else {
                            nameElem.innerHTML = originalName;
                        }
                    } else {
                        c.classList.add('hidden');
                        nameElem.innerHTML = originalName;
                    }
                });
                
                if (header) {
                    header.classList.toggle('hidden', !groupVisible);
                }
            });

            let msg = document.getElementById('no-search-results');
            if (!hasVisible && q !== '') {
                if (!msg) {
                    msg = document.createElement('p');
                    msg.id = 'no-search-results';
                    msg.className = 'text-slate-500 p-6 text-center italic';
                    document.getElementById('student-list-panel').appendChild(msg);
                }
                msg.textContent = `Nenhum aluno encontrado para "${e.target.value}".`;
            } else if (msg) {
                msg.remove();
            }
        }

        // --- NAVEGAÇÃO E RENDERIZAÇÃO VIEW DETALHE ALUNO ---
        
        function showAlunosList() {
            console.log("[showAlunosList] Voltando para a lista de alunos.");
            showView('dashboard-view');
            switchMainTab('alunos');
            window.scrollTo(0, 0);
        }

        function setupStudentTabNavigation() {
            const nav = document.getElementById('student-tabs-nav'); 
            nav.addEventListener('click', (e) => { 
                const button = e.target.closest('.tab-button');
                if(button){
                    const tab = button.getAttribute('data-tab'); 
                    switchStudentTab(tab);
                }
            });
        }
        
        function switchStudentTab(tabName) {
            console.log(`Trocando para aba de detalhe: ${tabName}`);
            document.querySelectorAll('#student-tabs-nav .tab-button').forEach(btn => {
                btn.classList.toggle('active', btn.getAttribute('data-tab') === tabName);
            });
            document.querySelectorAll('#student-tabs-content .tab-content').forEach(content => {
                const isActive = content.id === `tab-${tabName}`;
                content.style.display = isActive ? 'block' : 'none';
                content.classList.toggle('active', isActive);
            });
        }

        function switchStudentSubTab(subTabId) {
            console.log(`[switchStudentSubTab] Trocando para sub-aba: ${subTabId}`);
            const subNavContainer = document.getElementById('student-detail-subnav-container');
            const subContentContainer = document.getElementById('student-detail-subnav-content');
            
            if (subNavContainer) {
                subNavContainer.querySelectorAll('.subnav-button').forEach(btn => {
                    btn.classList.toggle('active', btn.getAttribute('data-subtab-id') === subTabId);
                });
            }
            if (subContentContainer) {
                 subContentContainer.querySelectorAll('.sub-tab-content').forEach(content => {
                    const isActive = content.id === subTabId;
                    content.style.display = isActive ? 'block' : 'none';
                    content.classList.toggle('active', isActive);
                });
            }
        }

        function showStudentDetail(email) {
            console.log(`[showStudentDetail] Exibindo detalhes para: ${email}`);
             try {
                const info = appState.alunosMap.get(email);
                if (!info) {
                    showError(`Aluno ${email} não encontrado no mapeamento.`);
                    return;
                }
                const emailNormalizado = normalizeString(email);
                const alunoNomeNormalizado = normalizeString(info.NomeCompleto); 
                const { escalas, faltas, notasT, notasP } = findDataByStudent(emailNormalizado, alunoNomeNormalizado);
                
                console.groupCollapsed(`[Debug Dados] Aluno: ${info.NomeCompleto} (Email: ${email})`);
                console.log("Info:", info);
                console.log("Escalas:", escalas);
                console.log("Faltas:", faltas);
                console.log("Notas Teóricas:", notasT);
                console.log("Notas Práticas:", notasP);
                console.groupEnd();

                renderStudentHeader(info);
                renderStudentDetailKPIs(faltas, notasP);
                renderTabInfo(info);
                renderTabEscala(escalas);
                renderTabFaltas(faltas);
                renderTabNotasTeoricas(notasT); 
                renderTabNotasPraticas(notasP); 

                showView('student-detail-view');
                switchStudentTab('info'); 
                window.scrollTo(0, 0); 
                console.log("[showStudentDetail] View de detalhe exibida.");
             } catch (e) {
                console.error("[showStudentDetail] Erro durante renderização:", e);
                showError(`Erro ao exibir detalhes do aluno: ${e.message}`);
                showView('dashboard-view'); 
                switchMainTab('alunos');
             }
        }
        
        function renderStudentHeader(info) {
             const p=document.getElementById('student-header'); const i=info.FotoID?`https://lh3.googleusercontent.com/d/${info.FotoID}=s160-c`:'https://placehold.co/80x80/e8eef7/475569?text=?'; const s=info.Status==='Ativo'?'badge-green':'badge-red'; 
             p.innerHTML=`<img src="${i}" alt="Foto" onerror="this.src='https://placehold.co/80x80/e8eef7/475569?text=?'">
                           <div class="flex-grow text-center sm:text-left mt-4 sm:mt-0">
                               <h2 class="text-2xl lg:text-3xl font-bold text-slate-900">${info.NomeCompleto}</h2>
                               <p class="text-base lg:text-lg text-slate-600 mt-1">${info.Curso}</p>
                           </div>
                           <div class="ml-auto flex-shrink-0 mt-4 sm:mt-0">
                               <span class="badge ${s} text-base py-2 px-4">${info.Status}</span>
                           </div>`;
        }

        function renderStudentDetailKPIs(faltas, notasP) {
             const tF=faltas.length; 
             const pF=faltas.filter(f=> f && !f.DataReposicaoISO).length; 
             let mP=0; let countP = 0; 
             if(notasP.length>0){
                 let s=0; 
                 notasP.forEach(n=>{
                     const k=Object.keys(n).find(k => /MÉDIA\s*\(NOTA FINAL\)[:]?/i.test(k)) || null; 
                     if(k){
                         let v=parseNota(n[k]); 
                         if(v>0){s+=v; countP++;}
                     }
                 }); 
                 mP=countP>0?s/countP:0;
             }
             document.getElementById('kpi-total-faltas').textContent = tF;
             document.getElementById('kpi-pendentes').textContent = pF;
             document.getElementById('kpi-media-pratica').textContent = mP > 0 ? mP.toFixed(1) : 'N/A';
             document.getElementById('kpi-modulos').textContent = `${countP}/${Object.keys(appState.notasPraticas).length}`;
        }
        
        function renderTabInfo(info) {
             const p=document.getElementById('tab-info'); p.innerHTML=`<dl class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-6 text-sm"><div class="border-b border-slate-200 pb-3"><dt>Email</dt><dd>${info.EmailHC||'N/A'}</dd></div><div class="border-b border-slate-200 pb-3"><dt>Nascimento</dt><dd>${info.DataNascimento ? new Date(info.DataNascimento).toLocaleDateString('pt-BR', {timeZone: 'UTC'}) : 'N/A'}</dd></div><div class="border-b border-slate-200 pb-3"><dt>Sexo</dt><dd>${info.Sexo||'N/A'}</dd></div><div class="border-b border-slate-200 pb-3"><dt>Estado Civil</dt><dd>${info.EstadoCivil||'N/A'}</dd></div><div class="md:col-span-2 lg:col-span-1 border-b border-slate-200 pb-3"><dt>CREFITO</dt><dd>${info.Crefito||'N/A'}</dd></div></dl>`;
        }
        
                        /* ===============================
                [ESCALAS] Calendar Pro - Helpers
                =============================== */

                /** Normaliza string para comparações. */
                function _esc_norm(s) {
                return (s || '').toString().trim().toLowerCase()
                    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                }

                /** Pega nome e email do aluno atualmente aberto na tela (do header e da aba Info). */
                function _esc_getCurrentStudentKey() {
                const nameEl = document.querySelector('#student-header h2');
                const name = nameEl ? nameEl.textContent.trim() : null;

                // procura <dt>Email</dt> e lê o irmão <dd>
                let email = null;
                document.querySelectorAll('#tab-info dl dt').forEach(dt => {
                    if (_esc_norm(dt.textContent) === 'email') {
                    const dd = dt.parentElement?.querySelector('dd');
                    if (dd) email = dd.textContent.trim();
                    }
                });

                return {
                    name,
                    email,
                    normName: _esc_norm(name),
                    normEmail: _esc_norm(email)
                };
                }

                /** Transforma 'dd/mm' em Date, inferindo ano perto do mês atual (heurística ±7 meses). */
                function _esc_parseDMInferYear(dm, refDate = new Date()) {
                if (!dm || !/^\d{1,2}\/\d{1,2}$/.test(dm)) return null;
                const [dStr, mStr] = dm.split('/');
                const d = parseInt(dStr, 10);
                const m = parseInt(mStr, 10); // 1..12

                // Heurística de ano: aproxima do mês atual
                const nowM = refDate.getMonth() + 1; // 1..12
                const nowY = refDate.getFullYear();
                let y = nowY;

                const delta = m - nowM; // -11..+11
                if (delta >= 7) y = nowY - 1;
                else if (delta <= -7) y = nowY + 1;

                const date = new Date(y, m - 1, d);
                if (isNaN(date.getTime())) return null;
                return date;
                }

                /** Formata ano-mês-dia (YYYY-MM-DD). */
                function _esc_iso(d) {
                const y = d.getFullYear();
                const m = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                return `${y}-${m}-${day}`;
                }

                /** Nome do mês PT-BR, capitalizado. */
                function _esc_monthLabel(year, month0) {
                const dt = new Date(year, month0, 1);
                const name = dt.toLocaleString('pt-BR', { month: 'long' });
                return name.charAt(0).toUpperCase() + name.slice(1) + ` ${year}`;
                }

                /** Gera todos os YYYY-MM dos dias da escala, ordenados e únicos. */
                function _esc_collectYearMonths(days) {
                const set = new Set();
                days.forEach(d => {
                    if (d._date instanceof Date) {
                    set.add(`${d._date.getFullYear()}-${String(d._date.getMonth()+1).padStart(2,'0')}`);
                    }
                });
                return Array.from(set).sort();
                }

                /** Divide “YYYY-MM” em {year, month0}. */
                function _esc_splitYM(ym) {
                const [y, m] = ym.split('-');
                return { year: parseInt(y, 10), month0: parseInt(m, 10) - 1 };
                }

                /** Agrupa faltas/reposições para o aluno atual em conjuntos de datas ISO. */
                function _esc_buildAbsMakeupSets() {
                const { normEmail, normName } = _esc_getCurrentStudentKey();
                const abs = new Set();
                const mak = new Set();

                (appState.ausenciasReposicoes || []).forEach(f => {
                    const fMail = _esc_norm(f.EmailHC);
                    const fName = _esc_norm(f.NomeCompleto);
                    const isThis =
                    (normEmail && fMail && normEmail === fMail) ||
                    (normName && fName && normName === fName);

                    if (!isThis) return;

                    if (f.DataAusenciaISO) abs.add(f.DataAusenciaISO);
                    if (f.DataReposicaoISO) mak.add(f.DataReposicaoISO);
                });

                return { abs, mak };
                }

                /** Verifica se é “presente” no dia atual via Ponto Hoje (somente hoje). */
                function _esc_isPresentTodayIso(iso) {
                const todayIso = new Date().toISOString().slice(0,10);
                if (iso !== todayIso) return false;

                const { normEmail, normName } = _esc_getCurrentStudentKey();
                const record = resolvePontoHojeRecordFromIdentity({ normEmail, normName });
                return Boolean(record);
                }

                /** Cria elementos com classe utilitária. */
                function _esc_el(tag, className, text) {
                const el = document.createElement(tag);
                if (className) el.className = className;
                if (text !== undefined) el.textContent = text;
                return el;
                }
/* =======================================================================
 * ORION: (Substituição) LÓGICA DA ABA DE ESCALA (v32.7 - Grid Simples)
 * Substitui os helpers de escala e a função renderTabEscala (Linha 2038)
 * ======================================================================= */

/**
 * [HELPER] (v32.5) Converte "dd/mm" para um objeto Date, com lógica de ano corrigida.
 */
function _esc_parseDMInferYear(dm, refDate = new Date()) {
    if (!dm || !/^\d{1,2}\/\d{1,2}$/.test(dm)) return null;
    const [dStr, mStr] = dm.split('/');
    const d = parseInt(dStr, 10);
    const m_idx = parseInt(mStr, 10) - 1; // 0-11
    
    const nowY = refDate.getFullYear();
    const nowM_idx = refDate.getMonth();

    let year = nowY; 
    if (nowM_idx <= 1 && m_idx >= 10) {
        year = nowY - 1;
    }
    else if (nowM_idx >= 10 && m_idx <= 1) {
        year = nowY + 1;
    }
    const date = new Date(year, m_idx, d);
    if (isNaN(date.getTime()) || date.getDate() !== d) return null;
    return date;
}

/**
 * [HELPER] Converte um objeto Date para "YYYY-MM-DD".
 */
function _esc_iso(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

/**
 * [HELPER] Calcula a duração em horas de um texto (ex: "07h-19h").
 */
function _esc_calculateHours(rawText) {
    if (!rawText) return 0;
    const s = rawText.replace(/(\d{1,2})h(\d{2})?/g, '$1:$2').replace(/h/g, ':00'); 
    const regex = /(\d{1,2}):?(\d{0,2})\s*(-|às)\s*(\d{1,2}):?(\d{0,2})/;
    const match = s.match(regex);

    if (!match) return 0; 

    let h1 = parseInt(match[1], 10);
    let m1 = parseInt(match[2] || '0', 10);
    let h2 = parseInt(match[4], 10);
    let m2 = parseInt(match[5] || '0', 10);

    if (isNaN(h1) || isNaN(h2)) return 0;

    const d1 = new Date(2000, 0, 1, h1, m1);
    const d2 = new Date(2000, 0, 1, h2, m2);
    let diff = (d2.getTime() - d1.getTime()) / (1000 * 60 * 60);

    if (diff < 0) { diff += 24; }
    return diff;
}

/**
 * [HELPER] Classifica o texto bruto da escala em uma chave de status.
 */
function _esc_normalizeStatusKey(raw) {
    if (!raw || typeof raw !== 'string' || raw.trim() === '') return 'none';
    const s = normalizeString(raw);
    
    if (s.includes('ausencia') || s.includes('falta')) return 'absent';
    if (s.includes('reposi') || s.includes('reposição')) return 'makeup';
    if (s.includes('folga') || s.includes('descanso')) return 'off';
    if (s.includes('aula')) return 'aula'; // Azul
    if (/(07\s*(:?h)?\d{0,2}\s*(-|às)\s*19\s*(:?h)?\d{0,2})/.test(s) || /(19\s*(:?h)?\d{0,2}\s*(-|às)\s*07\s*(:?h)?\d{0,2})/.test(s)) {
        return 'plantao'; // Roxo
    }
    if (s.trim().length > 0) return 'presenca'; // Verde
    return 'none';
}

/**
 * [HELPER] Retorna o rótulo legível para uma chave de status.
 */
function _esc_getHumanLabel(key) {
    return {
        'presenca': 'Presença',
        'plantao': 'Plantão',
        'aula': 'Aula',
        'absent': 'Ausência',
        'makeup': 'Reposição',
        'off': 'Folga',
        'none': 'Sem Dado'
    }[key] || 'Sem Dado';
}

/**
 * [HELPER] Calcula o Banco de Horas Total (Feitas / Deveria)
 */
function _esc_calculateTotalBank(escalas, absentDatesTotal, makeupDatesTotal) {
    let totalDeveria = 0;
    let totalFeitas = 0;

    escalas.forEach(escala => {
        const diasBrutos = escala.headersDay || []; 
        diasBrutos.forEach(ddmm => {
            const dateObj = _esc_parseDMInferYear(ddmm);
            if (!dateObj) return;
            
            const iso = _esc_iso(dateObj);
            const rawText = escala[ddmm] || ''; 
            const statusKey = _esc_normalizeStatusKey(rawText);
            const horas = _esc_calculateHours(rawText);

            if (horas === 0) return;

            if (statusKey !== 'off' && statusKey !== 'none') {
                totalDeveria += horas;
            }
            if (statusKey !== 'off' && statusKey !== 'none') {
                const isAusente = absentDatesTotal.has(iso);
                const isReposto = makeupDatesTotal.has(iso);
                if (!isAusente || isReposto) {
                     totalFeitas += horas;
                }
            } else if (statusKey === 'off' && makeupDatesTotal.has(iso)) {
                totalFeitas += horas;
            }
        });
    });
    return { totalFeitas, totalDeveria };
}

/**
 * [ORION] (Substituição) Renderiza a aba de escala (v32.7 - Grid Simples)
 * @param {Array} escalas - O array de escalas do aluno (de findDataByStudent).
 */
function renderTabEscala(escalas) {
    console.log("[ORION renderTabEscala v32.7] Renderizando. Escalas:", escalas);

    const $switcher = document.getElementById('escala-switcher-container');
    const $periodLabel = document.getElementById('escala-periodo-label');
    const $grid = document.getElementById('escala-heatmap-grid');
    const $sidebarKPIHoras = document.getElementById('escala-kpi-banco-horas');
    const $sidebarKPIEscala = document.getElementById('escala-kpi-resumo-escala');

    if (!$switcher || !$periodLabel || !$grid || !$sidebarKPIHoras || !$sidebarKPIEscala) {
        console.error("ORION: Estrutura da #tab-escala (v32.7) não encontrada. Abortando.");
        return;
    }

    const alunoEmailRaw = document.querySelector('#tab-info dd')?.textContent || '';
    const alunoNomeRaw = document.querySelector('#student-header h2')?.textContent || '';
    const alunoEmailNorm = normalizeString(alunoEmailRaw);
    const alunoNomeNorm = normalizeString(alunoNomeRaw);
    
    $switcher.innerHTML = '';
    $periodLabel.textContent = 'Selecione uma escala';
    $grid.innerHTML = '<p class="text-sm text-slate-500 italic p-4">Selecione uma escala para ver os dias.</p>';

    if (!escalas || escalas.length === 0) {
        $switcher.innerHTML = '<p class="text-sm text-slate-500 italic">Nenhuma escala encontrada para este aluno.</p>';
        return;
    }

    // 2. Calcula e exibe o BANCO DE HORAS TOTAL
    const absentDatesTotal = new Set();
    const makeupDatesTotal = new Set();
    appState.ausenciasReposicoes.forEach(f => {
        const fMail = normalizeString(f.EmailHC || '');
        if (fMail && fMail === alunoEmailNorm) {
            if (f.DataAusenciaISO) absentDatesTotal.add(f.DataAusenciaISO);
            if (f.DataReposicaoISO) makeupDatesTotal.add(f.DataReposicaoISO);
        }
    });

    const { totalFeitas, totalDeveria } = _esc_calculateTotalBank(escalas, absentDatesTotal, makeupDatesTotal);
    document.getElementById('banco-horas-total-feitas').textContent = `${totalFeitas.toFixed(0)}h`;
    document.getElementById('banco-horas-total-deveria').textContent = `${totalDeveria.toFixed(0)}h`;

    // 3. (Request 2) Cria os botões "Pill" para cada escala
    escalas.forEach((escala, idx) => {
        // Usa o nomeEscala corrigido ("Escala1")
        const nome = escala.nomeEscala ? escala.nomeEscala.replace('Escala', 'Escala ') : `Escala ${idx + 1}`;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'escala-pill';
        btn.textContent = nome;
        
        btn.addEventListener('click', () => {
            $switcher.querySelectorAll('.escala-pill').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const escalaSummary = drawScaleGrid(escala, alunoEmailNorm, alunoNomeNorm, absentDatesTotal, makeupDatesTotal);
            _esc_renderSidebarSummary(escalaSummary, nome);
        });
        
        $switcher.appendChild(btn);
    });

    // 4. (Request 1) Função para desenhar o grid APENAS COM OS DIAS DA ESCALA
    function drawScaleGrid(escala, emailNorm, nameNorm, absentDates, makeupDates) {
        
        const summary = {
            presenca: 0, plantao: 0, aula: 0, absent: 0, makeup: 0, off: 0,
            escalaFeitas: 0, escalaDeveria: 0
        };

        const diasBrutos = escala.headersDay || [];
        if (diasBrutos.length === 0) {
             $grid.innerHTML = '<p class="text-sm text-slate-500 italic p-4">Esta escala não contém dias (headersDay ausente).</p>';
             return summary;
        }

        const diasMap = new Map();
        diasBrutos.forEach(ddmm => {
            // [CORREÇÃO v32.6] - Usa padStart para meses
            const ddmmCorrigido = ddmm.includes('/') ? ddmm.split('/')[0] + '/' + ddmm.split('/')[1].padStart(2, '0') : ddmm;
            const dateObj = _esc_parseDMInferYear(ddmmCorrigido); // Lógica de ano v32.5
            
            if (dateObj) {
                const rawText = escala[ddmm] || ''; 
                diasMap.set(ddmmCorrigido, { dateObj, rawText });
            } else {
                console.warn(`Data inválida pulada: ${ddmm} (corrigido para ${ddmmCorrigido})`);
            }
        });

        if (diasMap.size === 0) {
            $periodLabel.textContent = escala.nomeEscala;
            $grid.innerHTML = '<p class="text-sm text-slate-500 italic p-4">Nenhum dia válido encontrado nesta escala.</p>';
            return summary;
        }
        
        const sortedDias = Array.from(diasMap.values()).sort((a, b) => a.dateObj - b.dateObj);
        
        const firstDayOfScale = sortedDias[0].dateObj;
        const lastDayOfScale = sortedDias[sortedDias.length - 1].dateObj;

        $periodLabel.textContent = `Período: ${firstDayOfScale.toLocaleDateString('pt-BR')} a ${lastDayOfScale.toLocaleDateString('pt-BR')}`;
        $grid.innerHTML = '';
        const todayISO = new Date().toISOString().slice(0, 10);
        
        // [NOVO v32.7] - Itera apenas pelos dias processados, sem placeholders
        sortedDias.forEach(day => {
            
            const iso = _esc_iso(day.dateObj);
            let rawText = day.rawText;
            let statusKey = _esc_normalizeStatusKey(rawText);
            const horas = _esc_calculateHours(rawText);
            
            let isAusente = false;
            let isReposto = false;

            // Sobrepõe status
            if (makeupDates.has(iso)) {
                statusKey = 'makeup';
                isReposto = true;
            }
            else if (absentDates.has(iso)) {
                statusKey = 'absent';
                isAusente = true;
            }
            else if (iso === todayISO) {
                const pontoRecord = resolvePontoHojeRecordFromIdentity({
                    normEmail: emailNorm,
                    normName: nameNorm
                });
                if (pontoRecord) {
                    const pontoStatus = _esc_normalizeStatusKey(rawText);
                    statusKey = (pontoStatus === 'plantao' || pontoStatus === 'aula') ? pontoStatus : 'presenca';
                    const horaEntradaPonto = pontoRecord.HoraEntrada || pontoRecord.horaEntrada || '';
                    rawText = horaEntradaPonto ? `Presente (${horaEntradaPonto})` : 'Presente';
                }
            }

            if (summary[statusKey] !== undefined) {
                summary[statusKey]++;
            }

            // Calcula horas
            if (horas > 0) {
                if (statusKey !== 'off' && statusKey !== 'none') {
                    summary.escalaDeveria += horas;
                    if (!isAusente || isReposto) {
                        summary.escalaFeitas += horas;
                    }
                } else if (statusKey === 'off' && isReposto) {
                    summary.escalaFeitas += horas;
                }
            }
            
            const tile = createTile(day.dateObj, rawText, statusKey);
            $grid.appendChild(tile);
        });

        return summary;
    }

    // 5. Renderiza o "Resumo da Escala" na sidebar
    function _esc_renderSidebarSummary(summary, nomeEscala) {
        document.getElementById('escala-kpi-resumo-escala').querySelector('.summary-title').textContent = `Resumo (${nomeEscala})`;
        document.getElementById('banco-horas-escala-feitas').textContent = `${summary.escalaFeitas.toFixed(0)}h`;
        document.getElementById('banco-horas-escala-deveria').textContent = `${summary.escalaDeveria.toFixed(0)}h`;
        
        document.getElementById('escala-resumo-grid').innerHTML = `
            <div class="item">
                <span class="label">Presença</span>
                <span class="value" style="color: #166534;">${summary.presenca || 0}</span>
            </div>
            <div class="item">
                <span class="label">Plantões</span>
                <span class="value" style="color: #3730a3;">${summary.plantao || 0}</span>
            </div>
            <div class="item">
                <span class="label">Aulas</span>
                <span class="value" style="color: #1d4ed8;">${summary.aula || 0}</span>
            </div>
            <div class="item">
                <span class="label">Ausências</span>
                <span class="value" style="color: #b91c1c;">${summary.absent || 0}</span>
            </div>
            <div class="item">
                <span class="label">Reposições</span>
                <span class="value" style="color: #854d0e;">${summary.makeup || 0}</span>
            </div>
            <div class="item">
                <span class="label">Folgas</span>
                <span class="value">${summary.off || 0}</span>
            </div>
        `;
    }

    // 6. Função para criar o HTML do "Tile" (com Header/Body/Footer)
    function createTile(dateObj, rawText, statusKey) {
        const tile = document.createElement('div');
        tile.className = 'compact-tile';
        tile.setAttribute('data-status', statusKey);
        
        const dayNumber = dateObj.getDate();
        const weekday = dateObj.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
        
        const humanStatus = _esc_getHumanLabel(statusKey);
        const mainText = (rawText && rawText.trim() !== '') ? rawText.trim() : humanStatus;
        
        tile.setAttribute('data-tip', mainText); // Tooltip

        tile.innerHTML = `
            <div class="tile-header">
                <span class="tile-weekday">${weekday}</span>
                <span class="tile-date">${dayNumber}</span>
            </div>
            <div class="tile-body-text" title="${mainText}">
                ${mainText}
            </div>
            <div class="tile-footer">
                <div class="classification-pill">${humanStatus}</div>
            </div>
        `;
        return tile;
    }

    // 7. Clica automaticamente na primeira escala
    if ($switcher.querySelector('.escala-pill')) {
        $switcher.querySelector('.escala-pill').click();
    } else {
        _esc_renderSidebarSummary({}, "N/A"); // Limpa o resumo
    }
}

/* =======================================================================
 * FIM DO BLOCO DE SUBSTITUIÇÃO DA ESCALA (v32.7)
 * ======================================================================= */
        function renderTabFaltas(faltas) {
             const c=document.getElementById('faltas-content'); if(!faltas||faltas.length===0){c.innerHTML='<p class="text-slate-500 p-6 text-sm italic">Nenhum registro de falta.</p>'; return;} const h=`<table class="min-w-full"><thead><tr><th class="text-left">Status</th><th class="text-left">Ausência</th><th class="text-left">Reposição</th><th class="text-left">Local</th><th class="text-left">Motivo</th></tr></thead><tbody class="bg-white">${faltas.map(f=>{const iP=!f.DataReposicaoISO; const sB=iP?'<span class="badge badge-yellow">Pendente</span>':'<span class="badge badge-green">Completa</span>'; const dA=f.DataAusenciaISO?new Date(f.DataAusenciaISO+'T00:00:00').toLocaleDateString('pt-BR', {timeZone: 'UTC'}):'-'; const dR=f.DataReposicaoISO?new Date(f.DataReposicaoISO+'T00:00:00').toLocaleDateString('pt-BR', {timeZone: 'UTC'}):'-'; const mS=f.Motivo?(f.Motivo.length>40?f.Motivo.substring(0,40)+'...':f.Motivo):'-'; return `<tr><td>${sB}</td><td>${dA}</td><td>${dR}</td><td>${f.Local||'-'}</td><td title="${f.Motivo||''}">${mS}</td></tr>`;}).join('')}</tbody></table>`; c.innerHTML = h;
        }

        function renderTabNotasTeoricas(notas) {
            console.log('[renderTabNotasTeoricas] Dados recebidos:', notas);
            const p = document.getElementById('notas-t-content-wrapper');

            if (!notas || typeof notas !== 'object' || Object.keys(notas).length === 0) {
                p.innerHTML = '<div class="content-card p-6"><p class="text-slate-500 text-sm italic">Nenhum registro de notas teóricas encontrado.</p></div>';
                return;
            }

            const mediaGroups = {
                'Média - Fisio1': ['Anatomopatologia', 'Sub/Anatomopatologia', 'Bases', 'Sub/Bases', 'Doenças Pulmonares', 'Doenças Cardíacas', 'Proc. Cirurgico', 'Avaliação', 'Sub/Avaliacao', 'VM', 'Sub/VM'],
                'Média - Fisio2': ['Técnicas e Recursos', 'Diag. Imagem'],
                'Média - Fisio3': ['Fisio aplicada', 'UTI'],
                'Média - Fisio4': ['Pediatria', 'Mobilização', 'Reab. Pulmonar'],
                'Outras': ['M. Cientifica', 'Saúde e politicas', 'Farmacoterapia', 'Bioética']
            };

            let html = '';
            const mediaKeys = Object.keys(notas).filter(k => k.toUpperCase().includes('MÉDIA'));
            
            if (mediaGroups.Outras.some(m => notas[m] && parseNota(notas[m]) > 0)) {
                 mediaKeys.push('Outras');
            }

            if (mediaKeys.length === 0 && !mediaGroups.Outras.some(m => notas[m] && parseNota(notas[m]) > 0)) {
                 p.innerHTML = '<div class="content-card p-6"><p class="text-slate-500 text-sm italic">Nenhuma nota ou média encontrada neste registro.</p></div>';
                 return;
            }

            mediaKeys.forEach(key => {
                const mediaValue = parseNota(notas[key]);
                const materias = (mediaGroups[key] || []);
                
                let detailsHtml = '';
                let hasDetails = false;
                
                materias.forEach(materia => {
                    if (notas[materia] !== null && notas[materia] !== undefined && String(notas[materia]).trim() !== '') {
                        const notaMateria = parseNota(notas[materia]);
                        if (notaMateria > 0 || String(notas[materia]).trim() !== '') { 
                            detailsHtml += `<li><span class="score-label">${materia}</span><span class="score-value">${notaMateria.toFixed(1)}</span></li>`;
                            hasDetails = true;
                        }
                    }
                });
                
                if (mediaValue > 0 || hasDetails) {
                     html += `
                        <div class="content-card p-5 radial-card">
                            <div class="flex-shrink-0">
                                <div class="radial-progress" style="--value:${mediaValue * 10};">
                                    <span class="radial-progress-value">${mediaValue > 0 ? mediaValue.toFixed(1) : 'N/A'}</span>
                                </div>
                            </div>
                            <div class="flex-grow">
                                <h4 class="text-base font-bold text-slate-800">${key}</h4>
                                <p class="text-sm text-slate-500 mt-1">Notas do módulo teórico</p>
                                ${hasDetails ? `
                                <details class="mt-3 group">
                                    <summary class="details-toggle list-none">
                                        <span>Ver detalhes</span>
                                        <svg class="transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>
                                    </summary>
                                    <div class="details-content">
                                        <ul class="details-scores-list">
                                            ${detailsHtml}
                                        </ul>
                                    </div>
                                </details>
                                ` : ''}
                            </div>
                        </div>
                    `;
                }
            });

            p.innerHTML = html || '<div class="content-card p-6"><p class="text-slate-500 text-sm italic">Nenhuma nota válida encontrada para exibir.</p></div>';
        }

        function calculatePracticeSummary(notasP) {
            let overallSum = 0;
            let overallCount = 0;
            const competency = {
                raciocinio: { sum: 0, count: 0 },
                tecnica: { sum: 0, count: 0 },
                profissionalismo: { sum: 0, count: 0 }
            };
            const last5Notes = [];
            const map = {
                raciocinio: [/1\.\s*CAPACIDADE DE AVALIAÇÃO/i, /2\.\s*PLANEJAMENTO E ORGANIZAÇÃO/i, /4\.\s*HABILIDADE DE ASSOCIAÇÃO/i],
                tecnica: [/3\.\s*HABILIDADE NA EXECUÇÃO/i],
                profissionalismo: [/5\.\s*HABILIDADE NO USO DE TERMOS/i, /8\.\s*COMUNICAÇÃO INTERPROFISSIONAL/i, /9\.\s*RELACIONAMENTO/i, /4\.\s*COMPORTAMENTO ÉTICO/i, /1\.\s*INICIATIVA/i, /2\.\s*INTERESSE/i, /3\.\s*RESPONSABILIDADE/i]
            };
            const sortedNotasP = [...notasP].sort((a, b) => {
                const dateA = a['Data/Hora'] ? new Date(String(a['Data/Hora']).replace(/-/g,'/')) : new Date(0);
                const dateB = b['Data/Hora'] ? new Date(String(b['Data/Hora']).replace(/-/g,'/')) : new Date(0);
                return dateA - dateB; 
            });
            sortedNotasP.forEach(n => {
                const kM = Object.keys(n).find(k => /MÉDIA\s*\(NOTA FINAL\)[:]?/i.test(k)) || null;
                const media = parseNota(n[kM]);
                if (media > 0) {
                    overallSum += media;
                    overallCount++;
                    last5Notes.push({ label: n.nomePratica, value: media });
                }
                Object.keys(n).forEach(key => {
                    const val = parseNota(n[key]);
                    if (val > 0) {
                        if (map.raciocinio.some(regex => regex.test(key))) {
                            competency.raciocinio.sum += val;
                            competency.raciocinio.count++;
                        } else if (map.tecnica.some(regex => regex.test(key))) {
                            competency.tecnica.sum += val;
                            competency.tecnica.count++;
                        } else if (map.profissionalismo.some(regex => regex.test(key))) {
                            competency.profissionalismo.sum += val;
                            competency.profissionalismo.count++;
                        }
                    }
                });
            });
            return {
                overallAvg: overallCount > 0 ? (overallSum / overallCount) : 0,
                raciocinioAvg: competency.raciocinio.count > 0 ? (competency.raciocinio.sum / competency.raciocinio.count) : 0,
                tecnicaAvg: competency.tecnica.count > 0 ? (competency.tecnica.sum / competency.tecnica.count) : 0,
                profissionalismoAvg: competency.profissionalismo.count > 0 ? (competency.profissionalismo.sum / competency.profissionalismo.count) : 0,
                last5Notes: last5Notes.slice(-5)
            };
        }


        function renderTabNotasPraticas(notasP) {
            console.log("[renderTabNotasPraticas v32] Dados recebidos:", notasP);
            const tabContainer = document.getElementById('tab-notas-p');
            
            if (!notasP || notasP.length === 0) {
                tabContainer.innerHTML = '<div class="content-card p-6"><p class="text-slate-500 text-sm italic">Nenhum registro de notas práticas encontrado.</p></div>';
                return;
            }
            const summary = calculatePracticeSummary(notasP);
            let summaryHtml = `
                <div id="practice-summary-dashboard">
                    <!-- Card Média Geral -->
                    <div class="content-card summary-progress-card animated-card delay-100">
                        <div class="summary-progress-ring" style="--value:${summary.overallAvg * 10}">
                            <div class="value">${summary.overallAvg.toFixed(1)}</div>
                        </div>
                        <div class="summary-text">
                            <h3>Média Geral Prática</h3>
                            <p>${summary.overallAvg >= 8.5 ? 'Excelente desempenho' : (summary.overallAvg >= 7 ? 'Bom desempenho' : 'Precisa de atenção')}</p>
                        </div>
                    </div>
                    <!-- Cards Competência -->
                    <div class="competency-card-container animated-card delay-200">
                        <div class="content-card kpi-base-card competency-card">
                            <div class="icon" style="background-color: rgba(0, 84, 180, 0.1); color: var(--accent-blue);">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" /></svg>
                            </div>
                            <div>
                                <div class="value" style="color: var(--accent-blue);">${summary.raciocinioAvg.toFixed(1)}</div>
                                <div class="label">Raciocínio Clínico</div>
                            </div>
                        </div>
                        <div class="content-card kpi-base-card competency-card">
                            <div class="icon" style="background-color: rgba(249, 115, 22, 0.15); color: var(--accent-orange);">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            </div>
                            <div>
                                <div class="value" style="color: var(--accent-orange);">${summary.tecnicaAvg.toFixed(1)}</div>
                                <div class="label">Execução Técnica</div>
                            </div>
                        </div>
                        <div class="content-card kpi-base-card competency-card">
                            <div class="icon" style="background-color: rgba(22, 163, 74, 0.15); color: var(--accent-green);">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666lM18 18.72A8.954 8.954 0 0112 21a8.954 8.954 0 01-6-2.28m12 0A9.09 9.09 0 0012 15.092m6 2.28m-6-2.28a9.09 9.09 0 01-3.741-.479 3 3 0 01-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666mM6 18.72A8.954 8.954 0 0012 21a8.954 8.954 0 006-2.28m-12 0A9.09 9.09 0 0112 15.092m-6 2.28m6-2.28a9.09 9.09 0 00-3.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666m0 0L6 15.75M12 12a3 3 0 11-6 0 3 3 0 016 0zm-3 3a3 3 0 100-6 3 3 0 000 6z" /></svg>
                            </div>
                            <div>
                                <div class="value" style="color: var(--accent-green);">${summary.profissionalismoAvg.toFixed(1)}</div>
                                <div class="label">Profissionalismo</div>
                            </div>
                        </div>
                    </div>
                    <!-- Gráfico de Evolução -->
                    <div class="content-card p-6 evolution-chart-card animated-card delay-300">
                        <h2 class="content-card-header mt-0 mb-2">Evolução das Notas Finais (Últimas 5)</h2>
                        <div class="evolution-chart-container">
                            ${summary.last5Notes.length > 0 ? summary.last5Notes.map((note, i) => `
                                <div class="evolution-bar" style="height: ${note.value * 10}%; animation-delay: ${i * 0.1}s;">
                                    <span class="bar-value">${note.value.toFixed(1)}</span>
                                    <span class="bar-label">${note.label}</span>
                                </div>
                            `).join('') : '<p class="text-sm text-slate-500 italic">Não há notas finais suficientes para exibir a evolução.</p>'}
                        </div>
                    </div>
                </div>
            `;

            let navHtml = '';
            let contentHtml = '';
            const sortedNotasPDesc = [...notasP].sort((a, b) => {
                const dateA = a['Data/Hora'] ? new Date(String(a['Data/Hora']).replace(/-/g,'/')) : new Date(0);
                const dateB = b['Data/Hora'] ? new Date(String(b['Data/Hora']).replace(/-/g,'/')) : new Date(0);
                return dateB - dateA;
            });

            sortedNotasPDesc.forEach((n, index) => {
                const isActive = index === 0;
                const tabId = `subtab-np-${index}`;
                const nomePratica = n.nomePratica || `Avaliação ${index + 1}`;
                navHtml += `<button class="subnav-button ${isActive ? 'active' : ''}" data-subtab-id="${tabId}">${nomePratica}</button>`;

                const keyM = Object.keys(n).find(k => /MÉDIA\s*\(NOTA FINAL\)[:]?/i.test(k)) || null;
                const keyC = Object.keys(n).find(k => /COMENTÁRIOS\s*DO\(A\)\s*SUPERVISOR\(A\)[:]?/i.test(k)) || null;
                const mediaFinal = parseNota(n[keyM]);
                const comentario = n[keyC] || 'Sem comentários.';
                const comentarioEscapado = comentario.replace(/'/g, "\\'").replace(/"/g, "&quot;").replace(/\n/g, "\\n");
                const dataFormatada = n['Data/Hora'] ? new Date(String(n['Data/Hora']).replace(/-/g,'/')).toLocaleDateString('pt-BR', {timeZone: 'UTC'}) : 'N/A';
                let numericalScores = [];
                let checklistScores = [];
                
                Object.entries(n).forEach(([key, value]) => {
                    const isIgnored = /DATA\/HORA|EMAILHC|NOMECOMPLETO|CURSO|SUPERVISOR|UNIDADE|PERIODO|TURNO|MÉDIA\s*\(NOTA FINAL\)|COMENTÁRIOS\s*DO\(A\)\s*SUPERVISOR\(A\)|O SUPERVISOR ESTÁ CIENTE|NOMEPRATICA/i.test(key.toUpperCase().trim());
                    if (!isIgnored && value) {
                        const parsedValue = parseNota(value);
                        if (!isNaN(parsedValue) && parsedValue > 0 && String(value).trim().match(/^[\d,.]+$/)) {
                            numericalScores.push({ label: key.replace(/:/g, ''), value: parsedValue });
                        } else if (String(value).trim() !== '' && String(value).trim() !== '0') {
                            checklistScores.push({ label: key.replace(/:/g, ''), value: value });
                        }
                    }
                });
                numericalScores.sort((a, b) => b.value - a.value);

                contentHtml += `
                    <div id="${tabId}" class="sub-tab-content ${isActive ? 'active' : ''}">
                        <div class="content-card p-6 lg:p-8">
                            <div class="evaluation-header">
                                <div class="evaluation-details">
                                    <h3 class="font-display text-xl font-bold text-slate-900 mb-4 col-span-2">${nomePratica}</h3>
                                    <dl>
                                        <div><dt>Supervisor</dt><dd>${n.Supervisor || 'N/A'}</dd></div>
                                        <div><dt>Data</dt><dd>${dataFormatada}</dd></div>
                                        <div><dt>Unidade</dt><dd>${n.Unidade || 'N/A'}</dd></div>
                                        <div><dt>Período</dt><dd>${n.Periodo || 'N/A'}</dd></div>
                                    </dl>
                                </div>
                                <div class="text-center sm:text-right flex-shrink-0">
                                    <p class="kpi-label">Nota Final</p>
                                    <p class="kpi-value">${mediaFinal.toFixed(1)}</p>
                                </div>
                            </div>
                            <div class="evaluation-layout mt-6">
                                <div class="skills-barchart-container">
                                    <h4 class="evaluation-section-title">Notas de Desempenho (0-10)</h4>
                                    ${numericalScores.length > 0 ? numericalScores.map(score => `
                                        <div class="bar-chart-item">
                                            <div class="flex justify-between items-center">
                                                <span class="bar-label" title="${score.label}">${score.label}</span>
                                                <span class="bar-value">${score.value.toFixed(1)}</span>
                                            </div>
                                            <div class="bar-bg mt-1">
                                                <div class="bar-fill" style="width: ${score.value * 10}%;"></div>
                                            </div>
                                        </div>
                                    `).join('') : '<p class="text-sm text-slate-500 italic">Nenhuma nota numérica registrada.</p>'}
                                </div>
                                <div class="skills-checklist-container">
                                    <h4 class="evaluation-section-title">Checklist de Habilidades</h4>
                                    ${checklistScores.length > 0 ? checklistScores.map(skill => `
                                        <div class="skill-checklist-item">
                                            <span class="skill-question">${skill.label}</span>
                                            <span class="skill-answer" title="${skill.value}">${skill.value}</span>
                                        </div>
                                    `).join('') : '<p class="text-sm text-slate-500 italic">Nenhum item de checklist registrado.</p>'}
                                </div>
                                <div class="evaluation-comments">
                                    <div class="flex justify-between items-center">
                                        <h4 class="evaluation-section-title mb-4">Comentários do Supervisor</h4>
                                        <button class="gemini-analysis-button" data-loading="false" data-comment="${comentarioEscapado}">
                                            ✨ Analisar Comentário
                                        </button>
                                    </div>
                                    <p>${comentario}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            });

            tabContainer.innerHTML = `
                ${summaryHtml}
                <h3 class="text-xl font-bold text-slate-800 mb-4 mt-10">Relatórios Detalhados</h3>
                <div id="student-detail-subnav-container" class="subnav-container">
                    ${navHtml}
                </div>
                <div id="student-detail-subnav-content">
                    ${contentHtml}
                </div>
            `;
            
            if (notasP.length > 0) {
                switchStudentSubTab('subtab-np-0');
            }
        }
        
        // --- [ORION] Funções da API Gemini (Versão LOCAL INSEGURA) ---
        
        function showGeminiModal(title, content) {
            const modal = document.getElementById('gemini-modal');
            document.getElementById('gemini-modal-title').innerText = title;
            document.getElementById('gemini-modal-content').innerHTML = content;
            modal.style.display = 'flex';
            setTimeout(() => modal.classList.add('show'), 10);
        }

        function closeGeminiModal() {
            const modal = document.getElementById('gemini-modal');
            modal.classList.remove('show');
            setTimeout(() => {
                modal.style.display = 'none';
                document.getElementById('gemini-modal-content').innerHTML = ''; 
            }, 300); 
        }

        async function handleAnalisarComentario(button, commentText) {
            if (button.dataset.loading === 'true') return;

            button.dataset.loading = 'true';
            button.disabled = true;
            button.innerHTML = 'A analisar...';

            showGeminiModal('✨ A analisar Avaliação', '<div class="gemini-loader"></div>');

            const systemPrompt = `
                Aja como um coordenador de ensino de fisioterapia altamente experiente. 
                A sua tarefa é analisar o comentário de avaliação de um supervisor sobre um aluno. 
                Extraia os pontos-chave de forma concisa.
                Responda APENAS com um objeto JSON válido, sem \`\`\`json ou qualquer outro texto.
                O formato deve ser:
                {
                  "pontosFortes": ["lista de elogios ou habilidades dominadas"],
                  "pontosAMelhorar": ["lista de críticas ou áreas de dificuldade"],
                  "feedbackGeral": "um resumo de uma frase sobre a avaliação"
                }
                Se uma categoria (pontosFortes ou pontosAMelhorar) não for mencionada, retorne um array vazio [].
            `;

            try {
                // [ORION] Chamada local, como solicitado
                const analysisJsonString = await callGeminiAPI(systemPrompt, commentText);
                const analysis = JSON.parse(analysisJsonString);
                
                let html = '';

                if (analysis.pontosFortes && analysis.pontosFortes.length > 0) {
                    html += '<h3>Pontos Fortes</h3><ul>';
                    analysis.pontosFortes.forEach(p => { html += `<li>${p}</li>`; });
                    html += '</ul>';
                } else {
                    html += '<h3>Pontos Fortes</h3><p>Nenhum ponto forte específico mencionado.</p>';
                }

                if (analysis.pontosAMelhorar && analysis.pontosAMelhorar.length > 0) {
                    html += '<h3>Pontos a Melhorar</h3><ul>';
                    analysis.pontosAMelhorar.forEach(p => { html += `<li>${p}</li>`; });
                    html += '</ul>';
                } else {
                    html += '<h3>Pontos a Melhorar</h3><p>Nenhum ponto a melhorar específico mencionado.</p>';
                }

                html += '<h3>Feedback Geral</h3>';
                html += `<p>${analysis.feedbackGeral || 'Não foi possível gerar um resumo.'}</p>`;

                showGeminiModal('✨ Análise da Avaliação', html);

            } catch (error) {
                console.error("Erro ao analisar comentário:", error);
                showGeminiModal('Erro na Análise', `<p>Não foi possível analisar o comentário. Verifique a consola para mais detalhes. Erro: ${error.message}</p>`);
            } finally {
                button.dataset.loading = 'false';
                button.disabled = false;
                button.innerHTML = '✨ Analisar Comentário';
            }
        }

        async function callGeminiAPI(systemPrompt, userQuery) {
            
            // [ORION - ALERTA DE SEGURANÇA CRÍTICO]
            // Como solicitado, a API Key está local.
            // ISTO É INSEGURO. NÃO USE EM PRODUÇÃO.
            // A chave será visível para qualquer pessoa no navegador.
            // Substitua a string abaixo pela sua chave.
            const apiKey = "AIzaSyAKZVcyv3ELzll3WG4cz4z0NuKU3rzfGqc";

            if (apiKey === "SUA_API_KEY_COMPLETA_VAI_AQUI") {
                 throw new Error("API Key não configurada. Substitua 'SUA_API_KEY_COMPLETA_VAI_AQUI' no código.");
            }

            // [ORION - CORREÇÃO DE MODELO]
            // Este é o nome de modelo correto para o endpoint v1beta que resolve os erros 404
            const modelName = "gemini-2.5-flash-preview-09-2025";
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

            const payload = {
                contents: [{ parts: [{ text: userQuery }] }],
                systemInstruction: { parts: [{ text: systemPrompt }] },
                generationConfig: {
                    responseMimeType: "application/json",
                    temperature: 0.2
                }
            };

            const options = {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            };

            const response = await fetchWithRetry(apiUrl, options);
            
            if (!response.ok) {
                 const errData = await response.json();
                 const errMsg = errData.error?.message || response.statusText;
                 throw new Error(`Falha na API: ${errMsg}`);
            }
            
            const result = await response.json();
            const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
            
            if (!text) {
                throw new Error("Resposta da API vazia ou mal formatada.");
            }
            return text;
        }

        async function fetchWithRetry(url, options, retries = 3, delay = 1000) {
            for (let i = 0; i < retries; i++) {
                try {
                    const response = await fetch(url, options);
                    if (response.ok || (response.status >= 400 && response.status < 500)) {
                        return response;
                    }
                    // Se for 5xx, tenta novamente
                } catch (error) {
                    // Erro de rede, tenta novamente
                }
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= 2; 
            }
            // Tenta a última vez
            return fetch(url, options);
        }

        // --- Inicia ---
        document.addEventListener('DOMContentLoaded', () => {
            console.log("DOM Carregado. Configurando login e exibindo view de login.");
            setupEventHandlers(); 
            showView('login-view');
        });

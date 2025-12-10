        // ====================================================================
        // FIREBASE INITIALIZATION
        // ====================================================================
        
        // Wait for window.firebase to be available (loaded by index.html)
        let fbApp, fbAuth, fbDB, fbStorage;
        const dbListenerUnsubscribes = []; // Store unsubscribe functions for cleanup
        
        // Initialize Firebase (will be called after window.firebase is available)
        function initializeFirebase() {
            if (!window.firebase) {
                console.error('[Firebase] window.firebase not available yet');
                return false;
            }
            
            try {
                fbApp = window.firebase.initializeApp(window.firebase.firebaseConfig);
                fbAuth = window.firebase.getAuth(fbApp);
                fbDB = window.firebase.getDatabase(fbApp);
                fbStorage = window.firebase.getStorage(fbApp);
                console.log('[Firebase] Initialized successfully with Storage');
                return true;
            } catch (error) {
                console.error('[Firebase] Initialization error:', error);
                return false;
            }
        }
        
        // ====================================================================
        // FIREBASE REALTIME DATABASE LISTENERS
        // ====================================================================
        
        /**
         * Setup real-time database listeners for all data paths
         * This replaces the legacy fetchAllData() approach
         */
        function setupDatabaseListeners() {
            console.log('[setupDatabaseListeners] Configurando listeners do Realtime Database...');
            
            if (!fbDB) {
                console.error('[setupDatabaseListeners] Firebase Database não inicializado.');
                return;
            }
            
            // Cancel any existing listeners first (cleanup)
            cancelAllDatabaseListeners();
            
            // Map database paths to appState keys
            const pathMappings = [
                { path: 'exportAll/Alunos/dados', stateKey: 'alunos', processor: (data) => data || [] },
                { path: 'exportAll/AusenciasReposicoes/dados', stateKey: 'ausenciasReposicoes', processor: (data) => normalizeAusenciasReposicoes(data || []) },
                { path: 'exportAll/NotasTeoricas/dados', stateKey: 'notasTeoricas', processor: (data) => {
                    // Handle different possible data structures from Firebase
                    let registros = [];
                    if (!data) {
                        console.log('[setupDatabaseListeners] NotasTeoricas: Nenhum dado encontrado no caminho /dados');
                        registros = [];
                    } else if (Array.isArray(data)) {
                        console.log('[setupDatabaseListeners] NotasTeoricas: Estrutura de array direto detectada');
                        registros = data;
                    } else if (typeof data === 'object') {
                        // Try to convert object to array if it has numbered/indexed keys
                        const values = Object.values(data);
                        if (values.length > 0 && values.every(v => v && typeof v === 'object')) {
                            console.log('[setupDatabaseListeners] NotasTeoricas: Convertendo objeto indexado em array');
                            registros = values;
                        } else {
                            console.warn('[setupDatabaseListeners] NotasTeoricas: Estrutura não reconhecida:', Object.keys(data).slice(0, 10));
                            registros = [];
                        }
                    }
                    
                    const normalized = registros.map(row => row && typeof row === 'object' ? deepNormalizeObject(row) : row);
                    console.log(`[setupDatabaseListeners] NotasTeoricas: ${normalized.length} registros processados e normalizados`);
                    
                    // Log sample data for debugging
                    if (normalized.length > 0) {
                        console.log('[setupDatabaseListeners] NotasTeoricas: Amostra do primeiro registro:', {
                            EmailHC: normalized[0].EmailHC || normalized[0].emailHC || normalized[0].emailhc,
                            NomeCompleto: normalized[0].NomeCompleto || normalized[0].nomeCompleto || normalized[0].nomecompleto,
                            campos: Object.keys(normalized[0]).slice(0, 15).join(', ')
                        });
                    }
                    
                    return { registros: normalized };
                }},
                { path: 'exportAll/Ponto/dados', stateKey: 'pontoStaticRows', processor: (data) => {
                    const processed = (data || []).map(row => row && typeof row === 'object' ? deepNormalizeObject(row) : row);
                    
                    // Log sample of available fields from first row for debugging
                    if (processed.length > 0 && processed[0]) {
                        const sampleFields = Object.keys(processed[0]);
                        console.log(`[setupDatabaseListeners] ✅ Ponto carregado com ${processed.length} registros`);
                        console.log('[setupDatabaseListeners] Campos disponíveis no Ponto:', sampleFields.slice(0, 15).join(', '));
                        
                        // IMPORTANT: Process ponto data immediately after loading
                        // This populates pontoState with dates and records
                        try {
                            extractAndPopulatePontoDates(processed);
                            updatePontoHojeMap();
                            console.log('[setupDatabaseListeners] ✅ Ponto data processado:', {
                                datas: pontoState.dates.length,
                                registros: pontoState.byDate.size
                            });
                        } catch (error) {
                            console.error('[setupDatabaseListeners] ❌ Erro ao processar dados do ponto:', error);
                            console.error('[setupDatabaseListeners] Stack trace:', error.stack);
                            console.error('[setupDatabaseListeners] Dados recebidos:', {
                                totalRegistros: processed.length,
                                primeiroRegistro: processed[0] ? Object.keys(processed[0]) : 'nenhum'
                            });
                        }
                        
                        // Check for Prática/Teórica field variations
                        const praticaTeoricaField = sampleFields.find(f => 
                            f.toLowerCase().includes('pratica') || 
                            f.toLowerCase().includes('teorica') ||
                            f.toLowerCase().includes('modalidade')
                        );
                        if (praticaTeoricaField) {
                            console.log(`[setupDatabaseListeners] ✅ Campo Prática/Teórica encontrado: "${praticaTeoricaField}"`);
                        } else {
                            console.warn('[setupDatabaseListeners] ⚠️ Campo Prática/Teórica NÃO encontrado');
                            console.warn('[setupDatabaseListeners] Procurando por: Pratica/Teorica, Prática/Teórica, Modalidade, Tipo, Turno, Periodo');
                        }
                    }
                    
                    extractAndPopulatePontoDates(processed);
                    return processed;
                }},
                // NEW: PontoPratica - Current scale ponto data
                { path: 'exportAll/PontoPratica/dados', stateKey: 'pontoPraticaRows', processor: (data) => {
                    const processed = (data || []).map(row => row && typeof row === 'object' ? deepNormalizeObject(row) : row);
                    
                    if (processed.length > 0 && processed[0]) {
                        const sampleFields = Object.keys(processed[0]);
                        console.log(`[setupDatabaseListeners] ✅ PontoPratica carregado com ${processed.length} registros`);
                        console.log('[setupDatabaseListeners] Campos disponíveis no PontoPratica:', sampleFields.slice(0, 15).join(', '));
                        
                        // Process PontoPratica data
                        try {
                            // PontoPratica data will be merged with Escalas data in extractAndPopulatePontoDates
                            extractAndPopulatePontoDates(processed, true); // true = from PontoPratica
                            updatePontoHojeMap();
                            console.log('[setupDatabaseListeners] ✅ PontoPratica data processado');
                        } catch (error) {
                            console.error('[setupDatabaseListeners] ❌ Erro ao processar PontoPratica:', error);
                            console.error('[setupDatabaseListeners] Stack trace:', error.stack);
                        }
                    }
                    
                    return processed;
                }},
                // Escalas - may need special handling
                { path: 'exportAll', stateKey: 'escalas', processor: (data) => {
                    // Extract escala sheets (Escala1, Escala2, etc.)
                    const escalasData = {};
                    let maxScaleNumber = 0;
                    
                    if (data && typeof data === 'object') {
                        const allKeys = Object.keys(data);
                        // Support Escala, EscalaTeoria, and EscalaPratica patterns
                        const escalaKeys = allKeys.filter(key => key.match(/^Escala(Teoria|Pratica)?\d+$/i));
                        
                        if (escalaKeys.length === 0) {
                            console.warn('[setupDatabaseListeners] ⚠️ Nenhuma escala encontrada em exportAll');
                            console.warn('[setupDatabaseListeners] Procurando por abas: Escala1, EscalaTeoria1, EscalaPratica1, etc.');
                            console.warn('[setupDatabaseListeners] Abas disponíveis:', allKeys.slice(0, 10).join(', '));
                        }
                        
                        escalaKeys.forEach(key => {
                            const escalaData = data[key];
                            
                            // Extract scale number and type (Teoria/Pratica) and track the highest one
                            const scaleMatch = key.match(/^Escala(Teoria|Pratica)?(\d+)$/i);
                            if (scaleMatch) {
                                const scaleType = scaleMatch[1] || ''; // 'Teoria', 'Pratica', or ''
                                const scaleNumber = parseInt(scaleMatch[2], 10);
                                if (scaleNumber > maxScaleNumber) {
                                    maxScaleNumber = scaleNumber;
                                }
                            }
                            
                            if (escalaData && escalaData.dados) {
                                const alunos = escalaData.dados || [];
                                
                                // Extract headersDay from the first student record
                                const headersDay = [];
                                const dayKeyRegex = /^(\d{1,2})_(\d{2})$/;
                                
                                if (alunos.length > 0 && alunos[0]) {
                                    const firstRow = alunos[0];
                                    const dayKeyMap = new Map();
                                    
                                    Object.keys(firstRow).forEach((rowKey) => {
                                        const match = rowKey.match(dayKeyRegex);
                                        if (match) {
                                            const day = match[1].padStart(2, '0');
                                            const month = match[2].padStart(2, '0');
                                            const pretty = `${day}/${month}`;
                                            if (!dayKeyMap.has(rowKey)) {
                                                dayKeyMap.set(rowKey, pretty);
                                            }
                                        }
                                    });
                                    
                                    // Get unique formatted dates and sort them
                                    const uniqueDates = Array.from(new Set(dayKeyMap.values()));
                                    headersDay.push(...uniqueDates);
                                    
                                    // Add pretty-formatted keys to each student row for easier access
                                    alunos.forEach((row) => {
                                        if (row && typeof row === 'object') {
                                            dayKeyMap.forEach((pretty, normalizedKey) => {
                                                if (typeof row[pretty] === 'undefined') {
                                                    row[pretty] = row[normalizedKey];
                                                }
                                            });
                                        }
                                    });
                                    
                                    // Log sample of available fields from first row for debugging
                                    const sampleFields = Object.keys(firstRow).slice(0, 10).join(', ');
                                    console.log(`[setupDatabaseListeners] ✅ Escala ${key} carregada:`, {
                                        alunos: alunos.length,
                                        dias: headersDay.length,
                                        camposAmostra: sampleFields
                                    });
                                } else {
                                    console.warn(`[setupDatabaseListeners] ⚠️ Escala ${key} não tem alunos`);
                                }
                                
                                // Determine scale type from key
                                const typeMatch = key.match(/^Escala(Teoria|Pratica)?(\d+)$/i);
                                const scaleType = typeMatch && typeMatch[1] ? typeMatch[1].toLowerCase() : 'pratica'; // Default to pratica
                                const scaleNum = typeMatch ? parseInt(typeMatch[2], 10) : 0;
                                
                                escalasData[key] = {
                                    nomeEscala: key,
                                    tipo: scaleType, // 'teoria' or 'pratica'
                                    numero: scaleNum,
                                    alunos: alunos,
                                    headersDay: headersDay,
                                    // For teoria scales, extract class days (Tuesdays and Thursdays)
                                    diasAula: scaleType === 'teoria' ? extractTheoryClassDays(headersDay) : []
                                };
                            } else {
                                console.warn(`[setupDatabaseListeners] ⚠️ Escala ${key} não tem campo 'dados'`);
                            }
                        });
                    }
                    
                    // Store the current scale number
                    if (maxScaleNumber > 0) {
                        appState.currentScaleNumber = maxScaleNumber;
                        console.log(`[setupDatabaseListeners] ✅ Escala atual detectada: Escala${maxScaleNumber}`);
                    }
                    
                    if (Object.keys(escalasData).length === 0) {
                        console.warn('[setupDatabaseListeners] ⚠️ Nenhuma escala válida foi processada');
                    }
                    
                    // After loading escalas, try to extract ponto data from them
                    if (Object.keys(escalasData).length > 0) {
                        try {
                            extractPontoFromEscalas(escalasData);
                        } catch (error) {
                            console.error('[setupDatabaseListeners] Erro ao extrair ponto das escalas:', error);
                        }
                    }
                    
                    return Object.keys(escalasData).length > 0 ? escalasData : appState.escalas;
                }},
                // EscalaAtual - Reference schedules with M, T, N codes (3 sectors)
                { path: 'exportAll/EscalaAtualCardiopediatria/dados', stateKey: 'escalaAtualCardiopediatria', processor: (data) => {
                    return processEscalaAtualData(data, 'Cardiopediatria');
                }},
                { path: 'exportAll/EscalaAtualUTI/dados', stateKey: 'escalaAtualUTI', processor: (data) => {
                    return processEscalaAtualData(data, 'UTI');
                }},
                { path: 'exportAll/EscalaAtualEnfermaria/dados', stateKey: 'escalaAtualEnfermaria', processor: (data) => {
                    return processEscalaAtualData(data, 'Enfermaria');
                }}
            ];
            
            // Helper function to process EscalaAtual data
            function processEscalaAtualData(data, sectorName) {
                if (!data || !Array.isArray(data)) {
                    console.warn(`[setupDatabaseListeners] ⚠️ EscalaAtual${sectorName} não encontrada ou formato inválido`);
                    return { alunos: [], headersDay: [], setor: sectorName };
                }
                
                console.log(`[setupDatabaseListeners] ✅ EscalaAtual${sectorName} carregada: ${data.length} registros`);
                
                // Log sample row fields for debugging
                if (data.length > 0 && data[0]) {
                    console.log(`[setupDatabaseListeners] EscalaAtual${sectorName} - Campos disponíveis:`, Object.keys(data[0]).join(', '));
                    console.log(`[setupDatabaseListeners] EscalaAtual${sectorName} - Amostra de dados:`, {
                        Aluno: data[0].Aluno,
                        Supervisor: data[0].Supervisor,
                        IDAluno: data[0].IDAluno,
                        Unidade: data[0].Unidade,
                        Horario: data[0].Horario || data[0]['Horário']
                    });
                }
                
                // Process similar to escalas - extract day headers
                const headersDay = [];
                // Regex to match date formats: d_mm, dd_mm, d_m, dd_m (day_month)
                // Examples: 1_12, 01_12, 31_12, 1_01, 15_1, etc.
                const dayKeyRegex = /^(\d{1,2})_(\d{1,2})$/;
                
                if (data.length > 0 && data[0]) {
                    const firstRow = data[0];
                    const dayKeyMap = new Map();
                    
                    Object.keys(firstRow).forEach((rowKey) => {
                        const match = rowKey.match(dayKeyRegex);
                        if (match) {
                            const day = match[1].padStart(2, '0');
                            const month = match[2].padStart(2, '0');
                            const pretty = `${day}/${month}`;
                            if (!dayKeyMap.has(rowKey)) {
                                dayKeyMap.set(rowKey, pretty);
                            }
                        }
                    });
                    
                    const uniqueDates = Array.from(new Set(dayKeyMap.values()));
                    headersDay.push(...uniqueDates);
                    
                    console.log(`[setupDatabaseListeners] EscalaAtual${sectorName} - ${headersDay.length} dias encontrados:`, headersDay.slice(0, 10).join(', ') + (headersDay.length > 10 ? '...' : ''));
                    
                    // Add pretty-formatted keys to each row for easier access
                    data.forEach((row) => {
                        if (row && typeof row === 'object') {
                            dayKeyMap.forEach((pretty, originalKey) => {
                                if (typeof row[pretty] === 'undefined') {
                                    row[pretty] = row[originalKey];
                                }
                            });
                        }
                    });
                }
                
                return {
                    alunos: data,
                    headersDay: headersDay,
                    setor: sectorName
                };
            }
            
            // Setup listener for each path
            pathMappings.forEach(({ path, stateKey, processor }) => {
                const dbRef = window.firebase.ref(fbDB, path);
                
                const unsubscribe = window.firebase.onValue(dbRef, (snapshot) => {
                    try {
                        const data = snapshot.val();
                        
                        // Log the path and whether data was found
                        if (data) {
                            console.log(`[setupDatabaseListeners] ✅ Dados encontrados em ${path} para ${stateKey}`);
                        } else {
                            console.warn(`[setupDatabaseListeners] ⚠️ Nenhum dado em ${path} para ${stateKey}`);
                            
                            // Try fallback path for NotasTeoricas if primary path has no data
                            if (stateKey === 'notasTeoricas') {
                                const fallbackPath = 'exportAll/NotasTeoricas';
                                console.log(`[setupDatabaseListeners] 🔄 Tentando caminho alternativo para NotasTeoricas: ${fallbackPath}`);
                                const fallbackRef = window.firebase.ref(fbDB, fallbackPath);
                                // Use get() for one-time read to avoid memory leaks
                                window.firebase.get(fallbackRef).then((fallbackSnapshot) => {
                                    const fallbackData = fallbackSnapshot.val();
                                    if (fallbackData) {
                                        console.log(`[setupDatabaseListeners] ✅ Dados encontrados no caminho alternativo: ${fallbackPath}`);
                                        // Process with special handling for nested 'dados' property
                                        let processedData = fallbackData;
                                        if (fallbackData.dados && Array.isArray(fallbackData.dados)) {
                                            console.log('[setupDatabaseListeners] NotasTeoricas: Estrutura com propriedade "dados" detectada no fallback');
                                            processedData = fallbackData.dados;
                                        }
                                        appState[stateKey] = processor(processedData);
                                        // Ensure data loading state is updated for fallback
                                        if (appState.dataLoadingState) {
                                            appState.dataLoadingState[stateKey] = true;
                                        }
                                        triggerUIUpdates(stateKey);
                                        checkAndHideLoadingOverlay();
                                    }
                                }).catch((error) => {
                                    console.error(`[setupDatabaseListeners] ❌ Erro ao buscar caminho alternativo: ${error.message}`);
                                });
                            }
                        }
                        
                        // Mark as loaded (even if data is null, we got a response)
                        if (appState.dataLoadingState) {
                            appState.dataLoadingState[stateKey] = true;
                        }
                        
                        // Process and update appState
                        appState[stateKey] = processor(data);
                        
                        // Special handling for alunos (update map)
                        if (stateKey === 'alunos') {
                            appState.alunosMap.clear();
                            if (appState.alunos && Array.isArray(appState.alunos)) {
                                appState.alunos.forEach(a => {
                                    if (a && a.EmailHC) appState.alunosMap.set(a.EmailHC, a);
                                });
                            }
                        }
                        
                        // Trigger UI updates
                        triggerUIUpdates(stateKey);
                        
                        // Check if all critical data has loaded, hide loading overlay
                        checkAndHideLoadingOverlay();
                        
                    } catch (error) {
                        console.error(`[setupDatabaseListeners] Erro ao processar ${stateKey}:`, error);
                        // Mark as loaded even on error to prevent infinite loading
                        if (appState.dataLoadingState) {
                            appState.dataLoadingState[stateKey] = true;
                        }
                        checkAndHideLoadingOverlay();
                    }
                }, (error) => {
                    console.error(`[setupDatabaseListeners] Erro no listener ${stateKey}:`, error);
                    
                    // Provide helpful error message based on error type
                    if (error.code === 'PERMISSION_DENIED') {
                        console.error(`[setupDatabaseListeners] ❌ PERMISSÃO NEGADA para ${path}`);
                        console.error('[setupDatabaseListeners] Verifique as regras do Firebase Realtime Database.');
                        console.error('[setupDatabaseListeners] As regras devem permitir leitura para usuários autenticados.');
                        showError(`Permissão negada ao carregar ${stateKey}. Verifique as regras do Firebase.`);
                    } else {
                        showError(`Erro ao carregar ${stateKey}: ${error.message}`);
                    }
                    
                    // Mark as loaded even on error
                    if (appState.dataLoadingState) {
                        appState.dataLoadingState[stateKey] = true;
                    }
                    checkAndHideLoadingOverlay();
                });
                
                // Store unsubscribe function
                dbListenerUnsubscribes.push(unsubscribe);
            });
            
            // Setup listeners for notas práticas (dynamic sheets)
            setupNotasPraticasListeners();
            
            console.log('[setupDatabaseListeners] Listeners configurados com sucesso.');
        }
        
        /**
         * Utility function to split concatenated field names into readable labels
         * Converts: "AspiracaoNasotraquealQuantoARealizacao" -> "Aspiração nasotraqueal quanto a realização"
         */
        function splitConcatenatedFieldName(fieldName) {
            if (!fieldName || typeof fieldName !== 'string') return fieldName;
            
            // Skip if it's a short field or already has spaces
            if (fieldName.length < 20 || fieldName.includes(' ')) {
                return fieldName;
            }
            
            // First pass: Insert space before uppercase letters that follow lowercase letters
            let result = fieldName.replace(/([a-z])([A-Z])/g, '$1 $2');
            
            // Second pass: Handle consecutive uppercase letters
            // EEquipe -> E Equipe, ARealizacao -> A Realizacao
            result = result.replace(/([A-Z])([A-Z][a-z])/g, '$1 $2');
            
            // Capitalize first letter, lowercase the rest (except proper nouns)
            // This creates a more natural sentence case
            result = result.charAt(0).toUpperCase() + result.slice(1).toLowerCase();
            
            // Restore capitalization for common acronyms and medical terms
            result = result
                .replace(/\busp\b/gi, 'USP')
                .replace(/\bhc\b/gi, 'HC')
                .replace(/\buti\b/gi, 'UTI')
                .replace(/\bvm\b/gi, 'VM')
                .replace(/\bcpap\b/gi, 'CPAP')
                .replace(/\bvni\b/gi, 'VNI');
            
            // Do NOT truncate - show full field name
            // User specifically requested full names, not truncated with "..."
            
            return result.trim();
        }

        /**
         * [SISTEMA ÚNICO] Valida integridade de uma nota prática
         * Garante que os dados essenciais estão presentes e válidos
         */
        function validateNotaPraticaIntegrity(registro, sheetName) {
            const errors = [];
            const warnings = [];
            
            // Campos obrigatórios para identificação única
            const requiredFields = {
                'EmailHC': registro.EmailHC || registro.emailHC || registro.emailhc,
                'NomeCompleto': registro.NomeCompleto || registro.nomeCompleto || registro.nomecompleto,
                'Data/Hora': registro['Data/Hora'] || registro['DataHora'] || registro.dataHora
            };
            
            // Valida campos obrigatórios
            Object.entries(requiredFields).forEach(([field, value]) => {
                if (!value || String(value).trim() === '') {
                    errors.push(`Campo obrigatório ausente: ${field}`);
                }
            });
            
            // Valida formato do email
            const email = requiredFields['EmailHC'];
            if (email && !email.includes('@')) {
                errors.push(`Email inválido: ${email}`);
            }
            
            // Valida se tem pelo menos uma nota numérica
            const hasNumericalGrade = Object.keys(registro).some(key => {
                const value = registro[key];
                if (typeof value === 'number' && value >= 0 && value <= 10) return true;
                if (typeof value === 'string' && /^\d+([.,]\d+)?$/.test(value.trim())) {
                    const num = parseFloat(value.replace(',', '.'));
                    return num >= 0 && num <= 10;
                }
                return false;
            });
            
            if (!hasNumericalGrade) {
                warnings.push('Nenhuma nota numérica válida (0-10) encontrada');
            }
            
            // Cria ID único para esta avaliação (hash dos campos chave)
            const uniqueString = `${requiredFields.EmailHC}|${requiredFields['Data/Hora']}|${sheetName}`;
            const uniqueId = generateSimpleHash(uniqueString);
            
            return {
                isValid: errors.length === 0,
                errors,
                warnings,
                uniqueId,
                validatedData: {
                    ...registro,
                    _uniqueId: uniqueId,
                    _sheetName: sheetName,
                    _validatedAt: new Date().toISOString()
                }
            };
        }
        
        /**
         * [SISTEMA ÚNICO] Gera hash simples para identificação
         */
        function generateSimpleHash(str) {
            let hash = 0;
            for (let i = 0; i < str.length; i++) {
                const char = str.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash; // Convert to 32bit integer
            }
            return Math.abs(hash).toString(16);
        }
        
        /**
         * [SISTEMA ÚNICO] Setup listeners for dynamic practical grades sheets com validação
         */
        function setupNotasPraticasListeners() {
            const exportAllRef = window.firebase.ref(fbDB, 'exportAll');
            
            const unsubscribe = window.firebase.onValue(exportAllRef, (snapshot) => {
                try {
                    const data = snapshot.val();
                    if (!data) {
                        console.warn('[setupNotasPraticasListeners] ⚠️ Nenhum dado em exportAll para notas práticas');
                        if (appState.dataLoadingState) {
                            appState.dataLoadingState.notasPraticas = true;
                        }
                        return;
                    }
                    
                    const notasPraticas = {};
                    let totalValidated = 0;
                    let totalErrors = 0;
                    let totalWarnings = 0;
                    
                    // Find all sheets that match practical grades pattern
                    Object.keys(data).forEach(sheetName => {
                        const normName = normalizeSheetName(sheetName);
                        if (isPracticeSheetName(normName)) {
                            const sheetData = data[sheetName];
                            if (sheetData && sheetData.dados) {
                                const nome = sheetData.nomeAbaOriginal || sheetName;
                                const validatedRegistros = [];
                                const sheetErrors = [];
                                
                                // [SISTEMA ÚNICO] Valida cada registro
                                (sheetData.dados || []).forEach((registro, idx) => {
                                    const validation = validateNotaPraticaIntegrity(registro, sheetName);
                                    
                                    if (validation.isValid) {
                                        validatedRegistros.push(validation.validatedData);
                                        totalValidated++;
                                    } else {
                                        totalErrors++;
                                        console.error(`[NotasPraticas] Registro ${idx + 1} em "${nome}" inválido:`, validation.errors);
                                        sheetErrors.push({
                                            index: idx + 1,
                                            errors: validation.errors
                                        });
                                    }
                                    
                                    if (validation.warnings.length > 0) {
                                        totalWarnings++;
                                        console.warn(`[NotasPraticas] Registro ${idx + 1} em "${nome}":`, validation.warnings);
                                    }
                                });
                                
                                // Só adiciona se tiver registros válidos
                                if (validatedRegistros.length > 0) {
                                    // Check if this nome already exists (duplicate sheet name)
                                    if (notasPraticas[nome]) {
                                        console.warn(`[setupNotasPraticasListeners] ⚠️ Duplicate sheet name detected: "${nome}"`);
                                        console.warn(`[setupNotasPraticasListeners] Original sheet: "${sheetName}" vs existing sheet`);
                                        console.warn(`[setupNotasPraticasListeners] Merging ${validatedRegistros.length} records into existing ${notasPraticas[nome].registros.length} records`);
                                        
                                        // Merge and deduplicate based on _uniqueId
                                        const existingIds = new Set(notasPraticas[nome].registros.map(r => r._uniqueId));
                                        const newUniqueRecords = validatedRegistros.filter(r => !existingIds.has(r._uniqueId));
                                        
                                        notasPraticas[nome].registros.push(...newUniqueRecords);
                                        notasPraticas[nome]._metadata.totalRegistros += sheetData.dados.length;
                                        notasPraticas[nome]._metadata.registrosValidos += newUniqueRecords.length;
                                        notasPraticas[nome]._metadata.duplicatasRemovidas = (notasPraticas[nome]._metadata.duplicatasRemovidas || 0) + (validatedRegistros.length - newUniqueRecords.length);
                                        
                                        console.log(`[setupNotasPraticasListeners] ✅ Merged into "${nome}": Added ${newUniqueRecords.length} unique, skipped ${validatedRegistros.length - newUniqueRecords.length} duplicates`);
                                    } else {
                                        notasPraticas[nome] = {
                                            nomePratica: nome,
                                            registros: validatedRegistros,
                                            _metadata: {
                                                totalRegistros: sheetData.dados.length,
                                                registrosValidos: validatedRegistros.length,
                                                registrosInvalidos: sheetErrors.length,
                                                duplicatasRemovidas: 0,
                                                ultimaValidacao: new Date().toISOString(),
                                                erros: sheetErrors
                                            }
                                        };
                                        console.log(`[setupNotasPraticasListeners] ✅ Notas práticas "${nome}" validadas: ${validatedRegistros.length}/${sheetData.dados.length} registros válidos`);
                                    }
                                } else if (sheetData.dados.length > 0) {
                                    console.error(`[setupNotasPraticasListeners] ❌ Todos os registros em "${nome}" são inválidos!`);
                                }
                            }
                        }
                    });
                    
                    if (Object.keys(notasPraticas).length > 0) {
                        appState.notasPraticas = notasPraticas;
                        console.log('[setupNotasPraticasListeners] ✅ Sistema de validação:');
                        console.log(`  - Módulos carregados: ${Object.keys(notasPraticas).length}`);
                        console.log(`  - Registros validados: ${totalValidated}`);
                        console.log(`  - Registros com erros: ${totalErrors}`);
                        console.log(`  - Avisos: ${totalWarnings}`);
                        triggerUIUpdates('notasPraticas');
                    } else {
                        console.warn('[setupNotasPraticasListeners] ⚠️ Nenhuma aba de notas práticas encontrada em exportAll');
                        console.warn('[setupNotasPraticasListeners] Procurando por abas que começam com "np" ou contêm "pratica"/"pratico"');
                        console.warn('[setupNotasPraticasListeners] Abas disponíveis em exportAll:', Object.keys(data).filter(k => !k.match(/^(Alunos|NotasTeoricas|Ponto|AusenciasReposicoes|Escala\d+)$/i)));
                    }
                    
                    // Mark as loaded
                    if (appState.dataLoadingState) {
                        appState.dataLoadingState.notasPraticas = true;
                    }
                    checkAndHideLoadingOverlay();
                    
                } catch (error) {
                    console.error('[setupNotasPraticasListeners] Erro:', error);
                    // Mark as loaded even on error
                    if (appState.dataLoadingState) {
                        appState.dataLoadingState.notasPraticas = true;
                    }
                    checkAndHideLoadingOverlay();
                }
            });
            
            dbListenerUnsubscribes.push(unsubscribe);
        }
        
        /**
         * Cancel all active database listeners
         */
        function cancelAllDatabaseListeners() {
            console.log(`[cancelAllDatabaseListeners] Cancelando ${dbListenerUnsubscribes.length} listeners...`);
            dbListenerUnsubscribes.forEach(unsubscribe => {
                if (typeof unsubscribe === 'function') {
                    unsubscribe();
                }
            });
            dbListenerUnsubscribes.length = 0; // Clear array
        }
        
        /**
         * Check if critical data has loaded and hide loading overlay
         */
        function checkAndHideLoadingOverlay() {
            if (!appState.dataLoadingState) return;
            
            // Check if critical data (alunos) has loaded
            const criticalDataLoaded = appState.dataLoadingState.alunos;
            
            if (criticalDataLoaded) {
                console.log('[checkAndHideLoadingOverlay] Dados críticos carregados, ocultando loading overlay.');
                showLoading(false);
                
                // Log data loading status
                console.log('[checkAndHideLoadingOverlay] Status de carregamento:', appState.dataLoadingState);
                console.log('[checkAndHideLoadingOverlay] Alunos carregados:', appState.alunos.length);
                console.log('[checkAndHideLoadingOverlay] Escalas carregadas:', Object.keys(appState.escalas).length);
                console.log('[checkAndHideLoadingOverlay] Ausências carregadas:', appState.ausenciasReposicoes.length);
            }
        }
        
        // Constants for student detail refresh
        // These data types affect hours bank calculations and must trigger re-renders
        // - escalas: Contains student schedules and attendance status
        // - ausenciasReposicoes: Contains absence and makeup dates
        // - pontoStaticRows/pontoPraticaRows: Contains daily attendance records
        const STUDENT_DETAIL_REFRESH_KEYS = ['escalas', 'ausenciasReposicoes', 'pontoStaticRows', 'pontoPraticaRows'];
        
        /**
         * Trigger UI updates based on data changes
         */
        function triggerUIUpdates(stateKey) {
            console.log(`[triggerUIUpdates] Atualizando UI para: ${stateKey}`);
            
            // Check which view is currently visible
            const dashboardView = document.getElementById('dashboard-view');
            const studentDetailView = document.getElementById('student-detail-view');
            const isDashboardVisible = dashboardView && dashboardView.style.display !== 'none';
            const isStudentDetailVisible = studentDetailView && studentDetailView.style.display !== 'none';
            
            // If student detail is visible, refresh it for relevant data changes
            if (isStudentDetailVisible && STUDENT_DETAIL_REFRESH_KEYS.includes(stateKey)) {
                console.log('[triggerUIUpdates] Dados relevantes atualizados, re-renderizando student detail view');
                // Get current student email from the header (more reliable than dd element)
                const headerElement = document.querySelector('#student-header h2');
                if (headerElement) {
                    const currentStudentName = headerElement.textContent.trim();
                    // Find the student by name in alunosMap to get email
                    const currentStudent = Array.from(appState.alunosMap.values()).find(s => 
                        s.NomeCompleto === currentStudentName
                    );
                    if (currentStudent && currentStudent.EmailHC) {
                        console.log('[triggerUIUpdates] Re-renderizando dados do aluno:', currentStudent.EmailHC);
                        showStudentDetail(currentStudent.EmailHC);
                    }
                }
            }
            
            // Only update dashboard if it's visible
            if (!isDashboardVisible) {
                return;
            }
            
            switch (stateKey) {
                case 'alunos':
                    if (typeof renderStudentList === 'function') {
                        renderStudentList(appState.alunos);
                    }
                    if (typeof renderAtAGlance === 'function') {
                        renderAtAGlance();
                    }
                    break;
                    
                case 'ausenciasReposicoes':
                    if (typeof renderAtAGlance === 'function') {
                        renderAtAGlance();
                    }
                    break;
                    
                case 'notasTeoricas':
                case 'notasPraticas':
                    if (typeof renderAtAGlance === 'function') {
                        renderAtAGlance();
                    }
                    break;
                    
                case 'pontoStaticRows':
                case 'pontoPraticaRows':
                    // Ponto data updated - refresh ponto view if on ponto tab
                    console.log(`[triggerUIUpdates] Dados de ${stateKey} atualizados, atualizando painel`);
                    
                    // Update ponto selectors and view if we're on the ponto tab
                    const pontoContent = document.getElementById('content-ponto');
                    if (pontoContent && !pontoContent.classList.contains('hidden')) {
                        console.log('[triggerUIUpdates] Atualizando painel de ponto (tab ativa)');
                        hydratePontoSelectors();
                        refreshPontoView();
                    }
                    
                    // Also update dashboard if visible
                    if (typeof renderAtAGlance === 'function') {
                        renderAtAGlance();
                    }
                    break;
                    
                case 'escalas':
                    // Escala data updated - refresh escala view if on escala tab
                    console.log(`[triggerUIUpdates] Dados de ${stateKey} atualizados`);
                    
                    const escalaContent = document.getElementById('content-escala');
                    if (escalaContent && escalaContent.style.display !== 'none') {
                        console.log('[triggerUIUpdates] Atualizando painel de Escala (tab ativa)');
                        // Check which tab is active and render the appropriate table
                        const activeTabBtn = document.querySelector('.escala-tab-btn.active');
                        if (activeTabBtn && activeTabBtn.dataset.escalaTab === 'mensal') {
                            renderMonthlyEscalaTable();
                        }
                    }
                    break;
                    
                case 'escalaAtualEnfermaria':
                case 'escalaAtualUTI':
                case 'escalaAtualCardiopediatria':
                    // EscalaAtual data updated - refresh if on Escala Atual tab
                    console.log(`[triggerUIUpdates] Dados de ${stateKey} atualizados`);
                    
                    const escalaContentAtual = document.getElementById('content-escala');
                    if (escalaContentAtual && escalaContentAtual.style.display !== 'none') {
                        // Check if we're on the "Escala Atual" tab
                        const activeTabBtnAtual = document.querySelector('.escala-tab-btn.active');
                        if (activeTabBtnAtual && activeTabBtnAtual.dataset.escalaTab === 'atual') {
                            console.log('[triggerUIUpdates] Atualizando Escala Atual (tab ativa)');
                            renderEscalaAtualTable();
                        }
                    }
                    break;
                    
                default:
                    // General update
                    if (typeof renderAtAGlance === 'function') {
                        renderAtAGlance();
                    }
            }
        }
        
        // Legacy API URL removed - all data now comes from Firebase

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

        /**
         * Parses semicolon-separated dates in DD/MM format
         * e.g., "06/08; 07/08; 09/08" -> ["06/08", "07/08", "09/08"]
         * Also handles typos like "09;08" (should be "09/08")
         * @param {string} dateString - The date string to parse
         * @returns {Array<string>} - Array of normalized DD/MM dates
         */
        function parseSemicolonDates(dateString) {
            if (!dateString || typeof dateString !== 'string') return [];
            
            // Split by semicolon
            const parts = dateString.split(';').map(s => s.trim()).filter(Boolean);
            const dates = [];
            
            for (let i = 0; i < parts.length; i++) {
                const part = parts[i];
                
                // Check if it's a valid DD/MM format
                const ddmmMatch = part.match(/^(\d{1,2})\/(\d{2})$/);
                if (ddmmMatch) {
                    const day = ddmmMatch[1].padStart(2, '0');
                    const month = ddmmMatch[2].padStart(2, '0');
                    dates.push(`${day}/${month}`);
                    continue;
                }
                
                // Check if it's just a day (e.g., "09" when previous was "06/08")
                // This handles typos like "06/08; 07/08; 09;08" where "09;08" should be "09/08"
                const dayOnlyMatch = part.match(/^(\d{1,2})$/);
                if (dayOnlyMatch) {
                    // Check if next part is a month (1-2 digits allowed for flexible parsing)
                    if (i + 1 < parts.length) {
                        const nextPart = parts[i + 1];
                        const monthMatch = nextPart.match(/^(\d{1,2})$/);
                        if (monthMatch) {
                            const day = dayOnlyMatch[1].padStart(2, '0');
                            const month = monthMatch[1].padStart(2, '0');
                            dates.push(`${day}/${month}`);
                            i++; // Skip the next part since we used it
                            continue;
                        }
                    }
                    // If we can't find a month, try to use the last known month
                    if (dates.length > 0) {
                        const lastDate = dates[dates.length - 1];
                        const lastMonth = lastDate.split('/')[1];
                        const day = dayOnlyMatch[1].padStart(2, '0');
                        dates.push(`${day}/${lastMonth}`);
                    }
                }
            }
            
            return dates;
        }
        
        /**
         * Converts a date string to normalized DD/MM format (with zero padding)
         * Accepts: D/M, DD/M, D/MM, DD/MM, D_M, DD_MM formats
         * @param {string} dateStr - The date string in DD/MM or D_M format
         * @returns {string} - Normalized DD/MM date (e.g., "06/08")
         */
        function normalizeDDMM(dateStr) {
            if (!dateStr) return '';
            const match = String(dateStr).match(/^(\d{1,2})\/(\d{1,2})$/);
            if (match) {
                const day = match[1].padStart(2, '0');
                const month = match[2].padStart(2, '0');
                return `${day}/${month}`;
            }
            // Try underscore format (from Firebase keys like "06_08" or "6_8")
            const underscoreMatch = String(dateStr).match(/^(\d{1,2})_(\d{1,2})$/);
            if (underscoreMatch) {
                const day = underscoreMatch[1].padStart(2, '0');
                const month = underscoreMatch[2].padStart(2, '0');
                return `${day}/${month}`;
            }
            return '';
        }
        
        /**
         * Converts ISO date (YYYY-MM-DD) to DD/MM format
         * @param {string} isoDate - The ISO date string
         * @returns {string} - Date in DD/MM format
         */
        function isoToDDMM(isoDate) {
            if (!isoDate) return '';
            const match = String(isoDate).match(/^(\d{4})-(\d{2})-(\d{2})/);
            if (match) {
                return `${match[3]}/${match[2]}`;
            }
            return '';
        }
        
        /**
         * Checks if a date (in ISO or DD/MM format) is in the student's EscalaPratica schedule
         * @param {string} absenceDate - The absence date (ISO or DD/MM)
         * @param {string} escalaName - The name of the scale (e.g., "EscalaPratica1")
         * @param {string} studentEmail - Student's email
         * @param {string} studentName - Student's name
         * @returns {Object} - { isInSchedule: boolean, scheduleDates: string[], escalaInfo: Object }
         */
        function checkAbsenceAgainstEscala(absenceDate, escalaName, studentEmail, studentName) {
            const result = {
                isInSchedule: false,
                scheduleDates: [],
                escalaInfo: null,
                studentEscalaDates: []
            };
            
            if (!absenceDate || !escalaName) {
                return result;
            }
            
            // Convert absence date to DD/MM format for comparison
            let absenceDDMM = '';
            if (absenceDate.includes('-')) {
                // ISO format
                absenceDDMM = isoToDDMM(absenceDate);
            } else {
                absenceDDMM = normalizeDDMM(absenceDate);
            }
            
            if (!absenceDDMM) {
                return result;
            }
            
            // Normalize the escala name to find it in appState.escalas
            // The escala name might be "EscalaPratica1", "Escala Pratica 1", "1", etc.
            let targetEscala = null;
            const normalizedEscalaName = normalizeString(escalaName);
            
            // First try exact match
            if (appState.escalas[escalaName]) {
                targetEscala = appState.escalas[escalaName];
            } else {
                // Try to find by normalized name
                for (const [key, escala] of Object.entries(appState.escalas)) {
                    if (normalizeString(key) === normalizedEscalaName) {
                        targetEscala = escala;
                        break;
                    }
                    // Also try matching just the number
                    const escalaNumMatch = escalaName.match(/\d+/);
                    const keyNumMatch = key.match(/\d+/);
                    if (escalaNumMatch && keyNumMatch && escalaNumMatch[0] === keyNumMatch[0]) {
                        // Check if it's a practice scale (EscalaPratica)
                        if (escala.tipo === 'pratica' || key.toLowerCase().includes('pratica')) {
                            targetEscala = escala;
                            break;
                        }
                    }
                }
            }
            
            if (!targetEscala) {
                console.log(`[checkAbsenceAgainstEscala] Escala "${escalaName}" não encontrada`);
                return result;
            }
            
            result.escalaInfo = targetEscala;
            result.scheduleDates = targetEscala.headersDay || [];
            
            // Find the student in the escala
            const normalizedEmail = studentEmail ? normalizeString(studentEmail) : '';
            const normalizedName = studentName ? normalizeString(studentName) : '';
            
            const studentInEscala = (targetEscala.alunos || []).find(a => {
                if (!a) return false;
                const aEmail = a.EmailHC ? normalizeString(a.EmailHC) : '';
                const aName = a.NomeCompleto ? normalizeString(a.NomeCompleto) : '';
                return (normalizedEmail && aEmail === normalizedEmail) || 
                       (normalizedName && aName === normalizedName);
            });
            
            if (studentInEscala) {
                // Get the student's specific schedule dates from the escala
                // The student row in EscalaPratica has date keys like "06/08" with values (schedule info)
                const studentDates = [];
                
                // Pre-normalize headersDay keys for efficient lookup
                const normalizedHeadersMap = new Map();
                (targetEscala.headersDay || []).forEach(dateKey => {
                    normalizedHeadersMap.set(dateKey, normalizeDDMM(dateKey));
                });
                
                // Check each date in headersDay to see if the student has that date
                normalizedHeadersMap.forEach((normalizedDateKey, dateKey) => {
                    // Check if student has this date with a non-empty value
                    const dateValue = studentInEscala[dateKey] || studentInEscala[normalizedDateKey];
                    if (dateValue && String(dateValue).trim() !== '' && String(dateValue).trim() !== '-') {
                        // Parse the date value - it might contain multiple dates like "06/08; 07/08; 09/08"
                        const parsedDates = parseSemicolonDates(String(dateValue));
                        if (parsedDates.length > 0) {
                            studentDates.push(...parsedDates);
                        } else {
                            // If no parsed dates, just use the key date if there's a schedule value
                            if (normalizedDateKey) {
                                studentDates.push(normalizedDateKey);
                            }
                        }
                    }
                });
                
                // Remove duplicates - dates are already normalized from parseSemicolonDates
                result.studentEscalaDates = [...new Set(studentDates)];
                
                // Check if the absence date is in the student's schedule
                // No need to normalize again since studentEscalaDates already contains normalized dates
                result.isInSchedule = result.studentEscalaDates.includes(absenceDDMM);
            }
            
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
                
                // Normalize Escala field
                const escalaRaw = pickFirstValue(copy, ['Escala', 'escala', 'ESCALA', 'EscalaPratica', 'escalaPratica', 'escalaP', 'EscalaP']);
                if (escalaRaw) {
                    copy.Escala = String(escalaRaw).trim();
                }
                
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

// Field name variants for robust matching (handles different casing/formatting from Firebase)
// These arrays are used for VALUE EXTRACTION - finding and reading field values from records
const EMAIL_FIELD_VARIANTS = ['EmailHC', 'emailHC', 'emailhc', 'EMAILHC', 'Email', 'email'];
const NAME_FIELD_VARIANTS = ['NomeCompleto', 'nomeCompleto', 'nomecompleto', 'NOMECOMPLETO', 'Nome', 'nome'];

// Metadata/non-grade fields to exclude from GRADE CALCULATIONS (uppercase for O(1) lookup)
// Note: Some fields overlap with the variants above because they serve different purposes:
// - Field variants are for READING values (e.g., find email to match student)
// - Excluded fields are for FILTERING (e.g., don't calculate average of email field)
const EXCLUDED_FIELDS_SET = new Set(['SERIALNUMBER', 'NOMECOMPLETO', 'EMAILHC', 'CURSO', 'EMAIL', 'NOME']);

// Time format regex patterns for schedule parsing
// Supports formats like: "18:00:00 às 21:00:00", "18:00 às 21:00", "7h às 12h"
const TIME_FORMAT_FULL_REGEX = /(\d{1,2}):(\d{2})(?::\d{2})?\s*(?:às|as|a|-)\s*(\d{1,2}):(\d{2})(?::\d{2})?/i;
const TIME_FORMAT_LEGACY_REGEX = /(\d{1,2})h\s*(?:às|as|a)?\s*(\d{1,2})h/i;

// Helper function to get a value from an object using field name variants
function getFieldValue(obj, fieldVariants) {
    if (!obj || !fieldVariants) return null;
    const matchingField = fieldVariants.find(f => obj[f] !== undefined && obj[f] !== null);
    return matchingField ? obj[matchingField] : null;
}

/**
 * Normalizes a key for deduplication of field name variants.
 * Removes accents, spaces, underscores, and converts to uppercase.
 * This helps detect variants like "Média Fisio1", "MediaFisio1", "_media_fisio1"
 * 
 * Note: This is different from normalizeString() which:
 * - Converts to lowercase (for general string comparison)
 * - Removes accents (same as this function)
 * - Does NOT remove spaces/underscores (preserves word boundaries)
 * 
 * This function needs uppercase and no spaces/underscores to match all 
 * variant patterns created by addKeyVariants().
 * 
 * @param {string} key - The field key to normalize
 * @returns {string} - Normalized key for comparison
 */
function normalizeKeyForDeduplication(key) {
    if (!key || typeof key !== 'string') return '';
    return key.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[_\s]/g, '');
}

/**
 * Checks if a key has accents (diacritical marks).
 * Uses Unicode decomposition to detect accented characters.
 * @param {string} key - The field key to check
 * @returns {boolean} - True if key has accented characters
 */
function keyHasAccents(key) {
    if (!key || typeof key !== 'string') return false;
    const normalized = key.normalize('NFD');
    const withoutDiacritics = normalized.replace(/[\u0300-\u036f]/g, '');
    return normalized !== withoutDiacritics;
}

const appState = {
    alunos: [],
    alunosMap: new Map(),
    pontoHojeMap: new Map(),
    pontoHojeAliases: new Map(),
    escalas: {},
    escalaAtualCardiopediatria: { alunos: [], headersDay: [], setor: 'Cardiopediatria' },
    escalaAtualUTI: { alunos: [], headersDay: [], setor: 'UTI' },
    escalaAtualEnfermaria: { alunos: [], headersDay: [], setor: 'Enfermaria' },
    ausenciasReposicoes: [],
    notasTeoricas: {},
    notasPraticas: {},
    pontoStaticRows: [], // OLD: Legacy ponto data from exportAll/Ponto/dados
    pontoPraticaRows: [], // NEW: Current scale ponto data from PontoPratica
    currentScaleNumber: null, // Detected current scale number (e.g., 9 for Escala9)
    todayBR: new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
    todayFullBR: new Date().toLocaleDateString('pt-BR'),
    isSidebarCollapsed: false,
    escalaPreview: {
        pdfRawUrl: '',
        pdfViewerUrl: ''
    },
    // Track data loading state
    dataLoadingState: {
        alunos: false,
        ausenciasReposicoes: false,
        notasTeoricas: false,
        notasPraticas: false,
        pontoStaticRows: false,
        pontoPraticaRows: false,
        escalas: false
    }
};

const ATRASO_THRESHOLD_MINUTES = 10;
const TOTAL_ESCALADOS = 25;
const MAX_RECENT_ACTIVITIES = 10;
// MAX_PENDING_STUDENTS removed - now shows all students

// InCor Dashboard KPI Thresholds (Semantic Status Configuration)
const INCOR_KPI_THRESHOLDS = {
    // Frequency: ratio of active to total students
    FREQUENCY_CRITICAL: 0.70,      // Below 70% active = Critical
    FREQUENCY_ALERT: 0.85,         // Below 85% active = Alert
    
    // Pending replacements count
    PENDING_CRITICAL: 10,          // 10+ pending = Critical
    PENDING_ALERT: 5,              // 5+ pending = Alert
    
    // Grade averages
    GRADE_CRITICAL: 6.0,           // Below 6.0 = Critical
    GRADE_ALERT: 7.0,              // Below 7.0 = Alert
    GRADE_EXCELLENT: 8.0           // 8.0+ = Excellent
};

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
        function initDashboard() {
            console.log('[initDashboard] Iniciando Dashboard com Firebase Realtime Database...');
            try {
                showLoading(true);
                
                // Reset data loading state
                Object.keys(appState.dataLoadingState).forEach(key => {
                    appState.dataLoadingState[key] = false;
                });
                
                // Setup database listeners - data will arrive asynchronously
                setupDatabaseListeners();
                
                // Initial UI setup
                switchMainTab('dashboard');
                document.querySelector('#dashboard-view').style.opacity = '1';
                
                // Loading will be hidden when critical data arrives (via checkAndHideLoadingOverlay)
                // But set a maximum timeout to prevent infinite loading
                setTimeout(() => {
                    console.log("[initDashboard] Timeout de 10 segundos atingido. Verificando estado dos dados...");
                    
                    // Check if any data was loaded
                    const anyDataLoaded = Object.values(appState.dataLoadingState).some(loaded => loaded);
                    
                    if (!anyDataLoaded) {
                        showLoading(false);
                        console.warn("[initDashboard] AVISO: Nenhum dado foi carregado após 10 segundos!");
                        console.warn("[initDashboard] Possíveis causas:");
                        console.warn("  1. Não há dados em /exportAll no Firebase");
                        console.warn("  2. Regras do Firebase estão bloqueando a leitura");
                        console.warn("  3. Estrutura de dados está incorreta");
                        console.warn("[initDashboard] Verifique o Firebase Console:");
                        console.warn("  https://console.firebase.google.com/project/dashboardalunos/database/dashboardalunos-default-rtdb/data");
                        
                        // Show user-friendly error
                        showError('Não foi possível carregar os dados do Firebase. Verifique se o App Script enviou os dados e se as regras do Firebase permitem leitura.', false);
                    } else {
                        console.log("[initDashboard] Inicialização completa. Real-time updates ativos.");
                        showLoading(false);
                    }
                }, 10000); // 10 second timeout
                
            } catch (error) {
                const errorMessage = error.message || "Erro desconhecido";
                showError(`Falha Crítica na Inicialização: ${errorMessage}. Verifique a conexão e recarregue.`);
                showLoading(false);
                showView('login-view');
            }
        }
        
        function setupEventHandlers() {
            console.log('[setupEventHandlers] Configurando listeners...');
            // Login form event listener - registered only once to prevent duplicate submissions
            document.getElementById('login-form').addEventListener('submit', handleLogin);
            setupHeaderNavigation();
            
            // Sidebar toggle - only if element exists (legacy support)
            const sidebarToggle = document.getElementById('sidebar-toggle');
            if (sidebarToggle) {
                sidebarToggle.addEventListener('click', toggleSidebar); 
            }
            
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
            // Suporta tanto .subnav-button (antigo) quanto .np-tab-button (novo design)
            document.getElementById('tab-notas-p').addEventListener('click', (e) => {
                const button = e.target.closest('.subnav-button, .np-tab-button');
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
            
            // Logout button
            const logoutButton = document.getElementById('logout-button');
            if (logoutButton) {
                logoutButton.addEventListener('click', handleLogout);
            }
            
            // Topbar logout button (Google-style user menu)
            const topbarLogoutButton = document.getElementById('topbar-logout-button');
            if (topbarLogoutButton) {
                topbarLogoutButton.addEventListener('click', handleLogout);
            }
            
            // User menu toggle
            const userMenuTrigger = document.getElementById('user-menu-trigger');
            if (userMenuTrigger) {
                userMenuTrigger.addEventListener('click', toggleUserMenu);
            }
            
            // Close user menu when clicking outside
            document.addEventListener('click', (e) => {
                const userMenu = document.getElementById('user-menu');
                const trigger = document.getElementById('user-menu-trigger');
                if (userMenu && !userMenu.contains(e.target)) {
                    userMenu.classList.remove('open');
                    // Update aria-expanded for accessibility
                    if (trigger) {
                        trigger.setAttribute('aria-expanded', 'false');
                    }
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

            // Academic Performance tabs - support both old and new class names
            const performanceTabs = document.querySelectorAll('.dash-tab, .incor-story-tab, .incor-modules-tab');
            performanceTabs.forEach(tab => {
                tab.addEventListener('click', handleAcademicTabSwitch);
            });
            
            // InCor Action filters
            const actionFilters = document.querySelectorAll('.incor-action-filter');
            actionFilters.forEach(filter => {
                filter.addEventListener('click', handleActionFilterSwitch);
            });

            console.log('[setupEventHandlers] Listeners configurados.');
        }
        
        // Handle action filter switching (All, Pending, Completed)
        // Uses data-status attribute for reliable filtering
        function handleActionFilterSwitch(e) {
            const filterValue = e.target.closest('.incor-action-filter')?.getAttribute('data-filter');
            if (!filterValue) return;
            
            // Update active filter button
            document.querySelectorAll('.incor-action-filter').forEach(btn => {
                btn.classList.toggle('incor-action-filter--active', btn.getAttribute('data-filter') === filterValue);
            });
            
            // Filter the table rows using data-status attribute
            const tbody = document.getElementById('recent-absences-list');
            if (!tbody) return;
            
            tbody.querySelectorAll('tr').forEach(row => {
                const rowStatus = row.getAttribute('data-status');
                
                if (filterValue === 'all') {
                    row.style.display = '';
                } else if (filterValue === 'pending') {
                    row.style.display = rowStatus === 'pending' ? '' : 'none';
                } else if (filterValue === 'completed') {
                    row.style.display = rowStatus === 'completed' ? '' : 'none';
                }
            });
        }

        // Handle academic performance tab switching
        function handleAcademicTabSwitch(e) {
            const tabName = e.target.getAttribute('data-tab');
            if (!tabName) return;
            
            // Update active tab - support both old and new class names
            document.querySelectorAll('.dash-tab, .incor-story-tab, .incor-modules-tab').forEach(btn => {
                const isActive = btn.getAttribute('data-tab') === tabName;
                btn.classList.toggle('dash-tab--active', isActive);
                btn.classList.toggle('incor-story-tab--active', isActive);
                btn.classList.toggle('incor-modules-tab--active', isActive);
            });
            
            // Show/hide content
            const modulesContainer = document.getElementById('module-averages-chart');
            const theoreticalContainer = document.getElementById('theoretical-grades-list');
            const practicalContainer = document.getElementById('practical-grades-list');
            
            if (modulesContainer) modulesContainer.hidden = tabName !== 'modulos';
            if (theoreticalContainer) theoreticalContainer.hidden = tabName !== 'teoricas';
            if (practicalContainer) practicalContainer.hidden = tabName !== 'praticas';
            
            // Render the grades list if needed
            if (tabName === 'teoricas') {
                renderTheoreticalGradesList();
            } else if (tabName === 'praticas') {
                renderPracticalGradesList();
            }
        }

        // Render list of all students with theoretical grades
        function renderTheoreticalGradesList() {
            const container = document.getElementById('theoretical-grades-list');
            if (!container) return;
            
            const activeStudents = appState.alunos.filter(s => s.Status === 'Ativo');
            
            if (activeStudents.length === 0) {
                container.innerHTML = '<div class="incor-pending__empty">Nenhum aluno ativo encontrado</div>';
                return;
            }
            
            // Helper function to check if key matches MÉDIA FISIO pattern (accent-insensitive)
            function isMediaFisioKey(key) {
                const keyNorm = key.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
                return keyNorm.includes('MEDIA') && keyNorm.includes('FISIO');
            }
            
            // Calculate average for each student from notasTeoricas
            const studentsWithGrades = activeStudents.map(student => {
                const emailNorm = normalizeString(student.EmailHC);
                const nomeNorm = normalizeString(student.NomeCompleto);
                
                let totalNota = 0;
                let countNota = 0;
                const countedKeys = new Set(); // Track keys to avoid double counting
                
                // First check if student object has MÉDIA FISIO fields directly
                Object.entries(student).forEach(([key, value]) => {
                    if (isMediaFisioKey(key)) {
                        const nota = parseNota(value);
                        if (nota > 0) {
                            const keyNorm = key.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
                            if (!countedKeys.has(keyNorm)) {
                                totalNota += nota;
                                countNota++;
                                countedKeys.add(keyNorm);
                            }
                        }
                    }
                });
                
                // Also check notasTeoricas.registros for this student (only if no grades found yet)
                if (countNota === 0 && appState.notasTeoricas && appState.notasTeoricas.registros) {
                    const studentRecord = appState.notasTeoricas.registros.find(r => {
                        const rEmail = normalizeString(r.EmailHC || r.emailHC || '');
                        const rNome = normalizeString(r.NomeCompleto || r.nomeCompleto || '');
                        return (emailNorm && rEmail === emailNorm) || (nomeNorm && rNome === nomeNorm);
                    });
                    
                    if (studentRecord) {
                        // Look for MÉDIA FISIO fields in the record
                        Object.entries(studentRecord).forEach(([key, value]) => {
                            if (isMediaFisioKey(key)) {
                                const nota = parseNota(value);
                                if (nota > 0) {
                                    const keyNorm = key.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
                                    if (!countedKeys.has(keyNorm)) {
                                        totalNota += nota;
                                        countNota++;
                                        countedKeys.add(keyNorm);
                                    }
                                }
                            }
                        });
                    }
                }
                
                const media = countNota > 0 ? (totalNota / countNota) : 0;
                
                return {
                    email: student.EmailHC,
                    nome: student.NomeCompleto || student.EmailHC,
                    media: media,
                    moduleCount: countNota
                };
            }).sort((a, b) => b.media - a.media);
            
            let html = '';
            studentsWithGrades.forEach((student, index) => {
                const escapedName = escapeHtml(student.nome);
                const gradeDisplay = student.media > 0 
                    ? `<span class="incor-grade__value">${student.media.toFixed(1)}</span>` 
                    : `<span class="incor-grade__value incor-grade__value--empty">-</span>`;
                const moduleInfo = student.moduleCount > 0 
                    ? `<span class="incor-grade__count">(${student.moduleCount})</span>` 
                    : '';
                
                html += `
                    <div class="incor-grade" data-email="${escapeHtml(student.email || '')}" data-index="${index}">
                        <span class="incor-grade__name" title="${escapedName}">${escapedName}</span>
                        <div class="incor-grade__info">
                            ${moduleInfo}
                            ${gradeDisplay}
                        </div>
                    </div>
                `;
            });
            
            container.innerHTML = html;
            
            // Add click handlers to navigate to student detail
            container.querySelectorAll('.incor-grade').forEach(item => {
                item.addEventListener('click', function() {
                    const email = this.getAttribute('data-email');
                    if (email && appState.alunosMap.has(email)) {
                        showStudentDetail(email);
                        setTimeout(() => switchStudentTab('notas-t'), 100);
                    }
                });
            });
        }

        // Helper function to find the practical grade key in a record (accent-insensitive)
        function findPracticalGradeKey(record) {
            return Object.keys(record).find(k => {
                const keyNorm = k.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
                return (keyNorm.includes('MEDIA') && keyNorm.includes('NOTA') && keyNorm.includes('FINAL')) ||
                       (keyNorm.includes('MEDIA') && keyNorm.includes('FINAL')) ||
                       (keyNorm.includes('NOTA') && keyNorm.includes('FINAL')) ||
                       keyNorm === 'MEDIANOTAFINAL';
            });
        }

        // Render list of all students with practical grades
        function renderPracticalGradesList() {
            const container = document.getElementById('practical-grades-list');
            if (!container) return;
            
            const activeStudents = appState.alunos.filter(s => s.Status === 'Ativo');
            
            if (activeStudents.length === 0) {
                container.innerHTML = '<div class="incor-pending__empty">Nenhum aluno ativo encontrado</div>';
                return;
            }
            
            // Get practical grades from notasPraticas (which is an object keyed by module name)
            const studentsWithGrades = activeStudents.map(student => {
                const emailNorm = normalizeString(student.EmailHC);
                const nomeNorm = normalizeString(student.NomeCompleto);
                
                // Collect all practical grades for this student across all modules
                let totalNota = 0;
                let countNota = 0;
                let moduleCount = 0;
                
                // Iterate through all modules in notasPraticas object
                if (appState.notasPraticas && typeof appState.notasPraticas === 'object') {
                    Object.values(appState.notasPraticas).forEach(modulo => {
                        if (modulo && modulo.registros && Array.isArray(modulo.registros)) {
                            // Find records for this student in this module
                            const studentRecords = modulo.registros.filter(r => {
                                const rEmail = normalizeString(r.EmailHC || r.emailHC || '');
                                const rNome = normalizeString(r.NomeCompleto || r.nomeCompleto || '');
                                return (emailNorm && rEmail === emailNorm) || (nomeNorm && rNome === nomeNorm);
                            });
                            
                            // Calculate average from the final grade field for each record
                            studentRecords.forEach(record => {
                                // Find the average/final grade field
                                // Use the helper function to find the grade key
                                const gradeKey = findPracticalGradeKey(record);
                                
                                if (gradeKey && record[gradeKey]) {
                                    const nota = parseNota(record[gradeKey]);
                                    if (nota > 0) {
                                        totalNota += nota;
                                        countNota++;
                                    }
                                }
                            });
                            
                            if (studentRecords.length > 0) {
                                moduleCount++;
                            }
                        }
                    });
                }
                
                const media = countNota > 0 ? (totalNota / countNota) : 0;
                
                return {
                    email: student.EmailHC,
                    nome: student.NomeCompleto || student.EmailHC,
                    media: media,
                    moduleCount: moduleCount,
                    avaliacoes: countNota
                };
            }).sort((a, b) => b.media - a.media);
            
            let html = '';
            studentsWithGrades.forEach((student, index) => {
                const escapedName = escapeHtml(student.nome);
                const gradeDisplay = student.media > 0 
                    ? `<span class="incor-grade__value">${student.media.toFixed(1)}</span>` 
                    : `<span class="incor-grade__value incor-grade__value--empty">-</span>`;
                const evalCount = student.avaliacoes > 0 
                    ? `<span class="incor-grade__count">(${student.avaliacoes})</span>` 
                    : '';
                
                html += `
                    <div class="incor-grade incor-grade--practical" data-email="${escapeHtml(student.email || '')}" data-index="${index}">
                        <span class="incor-grade__name" title="${escapedName}">${escapedName}</span>
                        <div class="incor-grade__info">
                            ${evalCount}
                            ${gradeDisplay}
                        </div>
                    </div>
                `;
            });
            
            container.innerHTML = html;
            
            // Add click handlers to navigate to student detail
            container.querySelectorAll('.incor-grade').forEach(item => {
                item.addEventListener('click', function() {
                    const email = this.getAttribute('data-email');
                    if (email && appState.alunosMap.has(email)) {
                        showStudentDetail(email);
                        setTimeout(() => switchStudentTab('notas-p'), 100);
                    }
                });
            });
        }

        async function handleLogin(event) {
            event.preventDefault();
            console.log("[handleLogin] Tentativa de login com Firebase Authentication...");

            const email = document.getElementById("login-email").value.trim();
            const password = document.getElementById("login-password").value.trim();
            const errorBox = document.getElementById("login-error");

            // CRITICAL FIX: Wait for Firebase to initialize if not ready yet
            if (!fbAuth) {
                console.warn("[handleLogin] Firebase Auth ainda não está disponível. Aguardando inicialização...");
                errorBox.textContent = "Inicializando sistema de autenticação...";
                errorBox.style.display = "block";
                
                // Wait for Firebase to be ready (max 5 seconds)
                const maxWaitTime = 5000;
                const startTime = Date.now();
                
                while (!fbAuth && (Date.now() - startTime) < maxWaitTime) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
                
                if (!fbAuth) {
                    console.error("[handleLogin] Firebase Auth não está disponível após espera. window.firebase:", window.firebase, "fbAuth:", fbAuth);
                    showError("Firebase não inicializado. Por favor, verifique sua conexão com a internet e recarregue a página. Se o problema persistir, abra o Console do navegador (F12) para mais detalhes.", true);
                    return;
                }
                
                console.log("[handleLogin] Firebase Auth agora está disponível. Prosseguindo com login...");
                errorBox.style.display = "none";
            }

            try {
                const userCredential = await window.firebase.signInWithEmailAndPassword(fbAuth, email, password);
                console.log("[handleLogin] Login bem-sucedido via Firebase:", userCredential.user.email);
                errorBox.style.display = "none";
                // onAuthStateChanged will handle the rest (redirect to dashboard)
            } catch (error) {
                console.error("[handleLogin] Erro no login Firebase:", error);
                let errorMessage = "Email ou senha inválidos.";
                
                // Provide more specific error messages
                if (error.code === 'auth/user-not-found') {
                    errorMessage = "Usuário não encontrado.";
                } else if (error.code === 'auth/wrong-password') {
                    errorMessage = "Senha incorreta.";
                } else if (error.code === 'auth/invalid-email') {
                    errorMessage = "Email inválido.";
                } else if (error.code === 'auth/too-many-requests') {
                    errorMessage = "Muitas tentativas falhadas. Tente novamente mais tarde.";
                } else if (error.code === 'auth/network-request-failed') {
                    errorMessage = "Erro de conexão. Verifique sua internet.";
                }
                
                showError(errorMessage, true);
            }
        }

        // Logout function
        function handleLogout() {
            console.log("[handleLogout] Fazendo logout...");
            if (!fbAuth) {
                console.error("[handleLogout] Firebase não inicializado.");
                return;
            }
            
            // Close user menu before logout
            const userMenu = document.getElementById('user-menu');
            if (userMenu) {
                userMenu.classList.remove('open');
            }
            
            window.firebase.signOut(fbAuth).then(() => {
                console.log("[handleLogout] Logout bem-sucedido.");
                // onAuthStateChanged will handle cleanup and redirect to login
            }).catch((error) => {
                console.error("[handleLogout] Erro ao fazer logout:", error);
                showError("Erro ao fazer logout.");
            });
        }
        
        // Toggle user menu (Google-style dropdown)
        function toggleUserMenu(event) {
            event.stopPropagation();
            const userMenu = document.getElementById('user-menu');
            const trigger = document.getElementById('user-menu-trigger');
            if (userMenu) {
                const isOpen = userMenu.classList.toggle('open');
                // Update aria-expanded for accessibility
                if (trigger) {
                    trigger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
                }
            }
        }
        
        // Update user menu with logged-in user info
        function updateUserMenuInfo(user) {
            if (!user) return;
            
            const userName = user.displayName || user.email.split('@')[0];
            const userEmail = user.email;
            
            // Update topbar user info
            const userNameEl = document.getElementById('user-name');
            if (userNameEl) {
                userNameEl.textContent = userName;
            }
            
            // Update dropdown user info
            const userMenuNameEl = document.getElementById('user-menu-name');
            if (userMenuNameEl) {
                userMenuNameEl.textContent = userName;
            }
            
            const userMenuEmailEl = document.getElementById('user-menu-email');
            if (userMenuEmailEl) {
                userMenuEmailEl.textContent = userEmail;
            }
            
            console.log('[updateUserMenuInfo] User menu atualizado para:', userName);
        }


        // Legacy fetchAllData() function removed - all data now comes from Firebase Realtime Database
        // Data is loaded via setupDatabaseListeners() which sets up real-time listeners

        /**
         * Helper function to check if a schedule value indicates a rest day
         */
        function isRestDayValue(dateValue) {
            if (!dateValue || typeof dateValue !== 'string') return false;
            const normalized = normalizeString(dateValue);
            return normalized.includes('folga') || 
                   normalized.includes('descanso') || 
                   normalized.includes('semana de descanso');
        }

        /**
         * Helper function to convert DD/MM date string to ISO format (YYYY-MM-DD)
         * Uses current year for year inference
         */
        function convertDDMMToISO(dateStr) {
            if (!dateStr || typeof dateStr !== 'string') return '';
            const [day, month] = dateStr.split('/');
            if (!day || !month) return '';
            const year = new Date().getFullYear();
            return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        }

        /**
         * Helper function to parse time information from schedule value
         * Matches formats like: "7h às 12h", "08h as 13h", "8h a 14h - Escala 1", "18:00:00 às 21:00:00"
         * Format: {hours}h [às|as|a] {hours}h [optional text] OR HH:MM:SS às HH:MM:SS
         * Returns: { horaEntrada: "08:00", horaSaida: "13:00" } or null
         */
        function parseTimeFromScheduleValue(dateValue) {
            if (!dateValue || typeof dateValue !== 'string') return null;
            
            // First try the new format: "HH:MM:SS às HH:MM:SS" (e.g., "18:00:00 às 21:00:00")
            const fullTimeMatch = dateValue.match(TIME_FORMAT_FULL_REGEX);
            if (fullTimeMatch) {
                return {
                    horaEntrada: `${fullTimeMatch[1].padStart(2, '0')}:${fullTimeMatch[2]}`,
                    horaSaida: `${fullTimeMatch[3].padStart(2, '0')}:${fullTimeMatch[4]}`
                };
            }
            
            // Fallback to legacy format: "7h às 12h", "08h as 13h", "8h a 14h - Escala 1"
            const timeMatch = dateValue.match(TIME_FORMAT_LEGACY_REGEX);
            if (timeMatch) {
                return {
                    horaEntrada: `${timeMatch[1].padStart(2, '0')}:00`,
                    horaSaida: `${timeMatch[2].padStart(2, '0')}:00`
                };
            }
            return null;
        }

        /**
         * Extract theory class days (Tuesdays and Thursdays) from header days
         * Theory classes only happen on Terças (Tuesdays) and Quintas (Thursdays)
         * @param {Array} headersDay - Array of dates in DD/MM format
         * @returns {Array} - Array of dates that are Tuesdays or Thursdays
         */
        function extractTheoryClassDays(headersDay) {
            if (!headersDay || !Array.isArray(headersDay)) return [];
            
            const currentYear = new Date().getFullYear();
            const theoryDays = [];
            
            headersDay.forEach(dateStr => {
                // Parse DD/MM format
                const parts = dateStr.split('/');
                if (parts.length === 2) {
                    const day = parseInt(parts[0], 10);
                    const month = parseInt(parts[1], 10) - 1; // JS months are 0-indexed
                    const date = new Date(currentYear, month, day);
                    const dayOfWeek = date.getDay();
                    
                    // Tuesday = 2, Thursday = 4
                    if (dayOfWeek === 2 || dayOfWeek === 4) {
                        const dayName = dayOfWeek === 2 ? 'Terça' : 'Quinta';
                        theoryDays.push({
                            data: dateStr,
                            diaSemana: dayName
                        });
                    }
                }
            });
            
            return theoryDays;
        }

        /**
         * Extract ponto (time tracking) data from Escalas
         * This function parses time information from the date columns in Escalas
         * Format example: "08h às 13h - Escala 1" or just "08h às 13h"
         */
        function extractPontoFromEscalas(escalasData) {
            console.log('[extractPontoFromEscalas] Extraindo dados de ponto das escalas...');
            
            if (!escalasData || typeof escalasData !== 'object') {
                console.warn('[extractPontoFromEscalas] Nenhum dado de escala fornecido');
                return [];
            }
            
            const pontoRecords = [];
            
            Object.keys(escalasData).forEach(escalaKey => {
                const escala = escalasData[escalaKey];
                const scalaName = escala.nomeEscala || escalaKey;
                const alunos = escala.alunos || [];
                const headersDay = escala.headersDay || [];
                
                // For each date in the scale
                headersDay.forEach(dateStr => {
                    // dateStr is in format "DD/MM"
                    // We need to find the corresponding field in aluno records
                    
                    alunos.forEach(aluno => {
                        if (!aluno) return;
                        
                        // Get the value for this date
                        const dateValue = aluno[dateStr];
                        if (!dateValue || typeof dateValue !== 'string') return;
                        
                        // Check for rest day markers first
                        if (isRestDayValue(dateValue)) {
                            // Create a ponto record for rest day (no times, just marker)
                            const isoDate = convertDDMMToISO(dateStr);
                            if (!isoDate) return;
                            
                            const pontoRecord = {
                                NomeCompleto: aluno.NomeCompleto || aluno.Nome || '',
                                EmailHC: aluno.EmailHC || aluno.Email || '',
                                SerialNumber: aluno.SerialNumber || aluno.Serial || aluno.ID || '',
                                DataISO: isoDate,
                                Escala: scalaName,
                                'Pratica/Teorica': 'Prática',
                                _source: 'escala',
                                _isRestDay: true // Mark as rest day
                            };
                            
                            pontoRecords.push(pontoRecord);
                            return;
                        }
                        
                        // Parse time information from the value
                        const timeInfo = parseTimeFromScheduleValue(dateValue);
                        
                        if (timeInfo) {
                            const { horaEntrada, horaSaida } = timeInfo;
                            
                            // Convert DD/MM to ISO date (current year)
                            const isoDate = convertDDMMToISO(dateStr);
                            if (!isoDate) return;
                            // Create a ponto record
                            const pontoRecord = {
                                NomeCompleto: aluno.NomeCompleto || aluno.Nome || '',
                                EmailHC: aluno.EmailHC || aluno.Email || '',
                                SerialNumber: aluno.SerialNumber || aluno.Serial || aluno.ID || '',
                                DataISO: isoDate,
                                HoraEntrada: horaEntrada,
                                HoraSaida: horaSaida,
                                Escala: scalaName,
                                'Pratica/Teorica': 'Prática', // Default, as escalas are typically for practical work
                                _source: 'escala', // Mark the source as escala
                                _scheduledEntrada: horaEntrada, // Store as scheduled time
                                _scheduledSaida: horaSaida
                            };
                            
                            pontoRecords.push(pontoRecord);
                        }
                    });
                });
            });
            
            console.log(`[extractPontoFromEscalas] ${pontoRecords.length} registros de ponto extraídos das escalas`);
            
            // Process these records into pontoState
            if (pontoRecords.length > 0) {
                extractAndPopulatePontoDates(pontoRecords, false, true); // fromPontoPratica=false, fromEscala=true
            }
            
            return pontoRecords;
        }

        function extractAndPopulatePontoDates(pontoRows, fromPontoPratica = false, fromEscala = false) {
            if (!Array.isArray(pontoRows) || pontoRows.length === 0) {
                console.log("[extractAndPopulatePontoDates] Nenhum registro de ponto para processar.");
                return;
            }

            const source = fromPontoPratica ? 'PontoPratica' : (fromEscala ? 'Escala' : 'Ponto');
            console.log(`[extractAndPopulatePontoDates] Processando ${pontoRows.length} registros de ${source}`);

            const dateSet = new Set(pontoState.dates); // Start with existing dates
            const groupedByDate = new Map();
            
            // First, copy existing data if we're merging
            if (fromPontoPratica || fromEscala) {
                pontoState.byDate.forEach((records, date) => {
                    groupedByDate.set(date, [...records]);
                });
            }
            
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
                    
                    // Normalize the record first
                    const normalizedRow = normalizePontoRecord(row, isoDate);
                    if (!normalizedRow) return;
                    
                    // Mark the source
                    normalizedRow._source = source;
                    
                    // Group records by date for initial cache population
                    if (!groupedByDate.has(isoDate)) {
                        groupedByDate.set(isoDate, []);
                    }
                    
                    const existingRecords = groupedByDate.get(isoDate);
                    
                    // If this is from PontoPratica, it should replace any existing record for the same person
                    if (fromPontoPratica) {
                        // Find and replace existing record for the same person
                        const existingIndex = existingRecords.findIndex(r => 
                            r.id === normalizedRow.id || 
                            r.nomeId === normalizedRow.nomeId ||
                            (r.emailNormalized && r.emailNormalized === normalizedRow.emailNormalized)
                        );
                        
                        if (existingIndex >= 0) {
                            // Replace existing record (PontoPratica takes precedence)
                            existingRecords[existingIndex] = normalizedRow;
                        } else {
                            // Add new record
                            existingRecords.push(normalizedRow);
                        }
                    } else if (fromEscala) {
                        // Only add from Escala if no record exists for this person from PontoPratica
                        const hasPontoPraticaRecord = existingRecords.some(r => 
                            r._source === 'PontoPratica' && (
                                r.id === normalizedRow.id || 
                                r.nomeId === normalizedRow.nomeId ||
                                (r.emailNormalized && r.emailNormalized === normalizedRow.emailNormalized)
                            )
                        );
                        
                        if (!hasPontoPraticaRecord) {
                            existingRecords.push(normalizedRow);
                        }
                    } else {
                        // Legacy Ponto data - just add it
                        existingRecords.push(normalizedRow);
                    }
                    
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
            
            // Update byDate map and cache
            groupedByDate.forEach((rows, iso) => {
                pontoState.byDate.set(iso, rows);
                pontoState.cache.set(makePontoCacheKey(iso, 'all'), rows);
            });

            console.log(`[extractAndPopulatePontoDates] ${pontoState.dates.length} datas encontradas:`, pontoState.dates.slice(0, 5));
            console.log(`[extractAndPopulatePontoDates] ${pontoState.byDate.size} datas populadas no cache.`);
        }

        // --- NAVEGAÇÃO PRINCIPAL ---
        // Helper function to handle navigation link clicks
        function handleNavLinkClick(e, linkSelector) {
            const link = e.target.closest(linkSelector);
            if (link) {
                e.preventDefault();
                switchMainTab(link.getAttribute('data-tab'));
            }
        }
        
        function setupHeaderNavigation() {
            // Modern header navigation
            const headerNav = document.querySelector('#header-nav');
            if (headerNav) {
                headerNav.addEventListener('click', (e) => handleNavLinkClick(e, '.header-nav-link'));
            }
            
            // Legacy sidebar support (backward compatibility)
            const sidebar = document.querySelector('#app-sidebar nav');
            if (sidebar) {
                sidebar.addEventListener('click', (e) => handleNavLinkClick(e, '.sidebar-link'));
            }
        }
        
        // Keep legacy function name for compatibility
        function setupSidebarNavigation() {
            setupHeaderNavigation();
        }
        
        // Legacy function - no longer needed with top header navigation
        function toggleSidebar() {
            console.log('[toggleSidebar] Função legacy - não aplicável com navegação de cabeçalho');
        }
        
        function switchMainTab(tabName) {
            console.log("[switchMainTab] Trocando para aba principal:", tabName);
            
            // Update all navigation links (both header and legacy sidebar)
            document.querySelectorAll('.header-nav-link, .sidebar-link').forEach(l => {
                l.classList.toggle('active', l.getAttribute('data-tab') === tabName);
            });
            
            // Find all view containers in both modern and legacy layouts
            const allSubViews = document.querySelectorAll('.main-content-area > .view-container, main > .view-container');
            allSubViews.forEach(view => {
                const isActive = view.id === `content-${tabName}`;
                view.style.display = isActive ? 'block' : 'none';
                if (isActive) {
                    view.style.animation = 'none';
                    view.offsetHeight; 
                    view.style.animation = null; 
                }
            });
            
            // Initialize ponto panel when switching to ponto tab
            if (tabName === 'ponto') {
                console.log('[switchMainTab] Inicializando painel de ponto...');
                // Check if ponto data is already loaded (from any source)
                const hasPontoData = (appState.pontoStaticRows && appState.pontoStaticRows.length > 0) ||
                                     (appState.pontoPraticaRows && appState.pontoPraticaRows.length > 0) ||
                                     (pontoState.dates.length > 0);
                
                if (hasPontoData) {
                    console.log('[switchMainTab] Dados de ponto já carregados, inicializando painel');
                    // Ensure ponto state is populated
                    if (pontoState.dates.length === 0) {
                        console.log('[switchMainTab] Processando dados de ponto pela primeira vez');
                        // Process all available data sources
                        if (appState.pontoStaticRows && appState.pontoStaticRows.length > 0) {
                            extractAndPopulatePontoDates(appState.pontoStaticRows);
                        }
                        if (appState.pontoPraticaRows && appState.pontoPraticaRows.length > 0) {
                            extractAndPopulatePontoDates(appState.pontoPraticaRows, true); // fromPontoPratica = true
                        }
                        if (appState.escalas && Object.keys(appState.escalas).length > 0) {
                            extractPontoFromEscalas(appState.escalas);
                        }
                        updatePontoHojeMap();
                    }
                    // Initialize or refresh the panel
                    initializePontoPanel();
                } else {
                    console.log('[switchMainTab] Aguardando dados de ponto do Firebase...');
                    // Show loading state in ponto panel
                    const loadingState = document.getElementById('ponto-loading-state');
                    const emptyState = document.getElementById('ponto-empty-state');
                    if (loadingState) {
                        loadingState.hidden = false;
                        loadingState.textContent = 'Carregando dados do ponto do Firebase...';
                    }
                    if (emptyState) {
                        emptyState.hidden = true;
                    }
                }
            }
            
            // Initialize escala atual panel when switching to escala tab
            if (tabName === 'escala') {
                console.log('[switchMainTab] Inicializando painel de Escala Atual...');
                initializeEscalaAtualPanel();
            }
            
            window.scrollTo(0, 0);
        }
        
        // ====================================================================
        // ESCALA - NEW MONTHLY VIEW FROM FIREBASE
        // Renders the complete monthly schedule from Escala sheets
        // ====================================================================
        
        let escalaAtualState = {
            initialized: false
        };
        
        /**
         * Initialize the Escala panel - simplified version without tabs
         */
        function initializeEscalaAtualPanel() {
            console.log('[initializeEscalaAtualPanel] Initializing Escala panel with tabs...');
            
            // Update today's date in both tab headers
            const todayDateEl = document.getElementById('escala-atual-today-date');
            const escalaAtualDateEl = document.getElementById('escala-atual-date');
            
            if (todayDateEl || escalaAtualDateEl) {
                const today = new Date();
                const formattedDate = today.toLocaleDateString('pt-BR', {
                    weekday: 'long',
                    day: '2-digit',
                    month: 'long',
                    year: 'numeric'
                });
                
                if (todayDateEl) todayDateEl.textContent = formattedDate;
                if (escalaAtualDateEl) escalaAtualDateEl.textContent = formattedDate;
            }
            
            // Setup tab switching
            const tabButtons = document.querySelectorAll('.escala-tab-btn');
            tabButtons.forEach(btn => {
                btn.addEventListener('click', () => {
                    const targetTab = btn.dataset.escalaTab;
                    
                    // Update button states
                    tabButtons.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    
                    // Update content visibility
                    document.querySelectorAll('.escala-tab-content').forEach(content => {
                        content.classList.remove('active');
                    });
                    
                    const tabContent = document.getElementById(`escala-${targetTab}-container`);
                    if (tabContent) {
                        tabContent.classList.add('active');
                        
                        // Render the appropriate table when tab becomes active
                        if (targetTab === 'mensal') {
                            renderMonthlyEscalaTable();
                        } else if (targetTab === 'atual') {
                            renderEscalaAtualTable();
                        } else if (targetTab === 'arquivos') {
                            loadStorageFiles();
                        }
                    }
                });
            });
            
            // Mark as initialized
            escalaAtualState.initialized = true;
            
            // Render the default tab (mensal)
            renderMonthlyEscalaTable();
        }
        
        /**
         * Load and display files from Firebase Storage
         * Files are expected to be in the root of the storage bucket
         */
        async function loadStorageFiles() {
            console.log('[loadStorageFiles] Starting to load files from Firebase Storage...');
            
            const loadingEl = document.getElementById('storage-files-loading');
            const emptyEl = document.getElementById('storage-files-empty');
            const errorEl = document.getElementById('storage-files-error');
            const contentEl = document.getElementById('storage-files-content');
            const errorMessageEl = document.getElementById('storage-error-message');
            
            // Show loading state
            if (loadingEl) loadingEl.style.display = 'flex';
            if (emptyEl) emptyEl.style.display = 'none';
            if (errorEl) errorEl.style.display = 'none';
            if (contentEl) contentEl.style.display = 'none';
            
            try {
                if (!fbStorage) {
                    throw new Error('Firebase Storage não inicializado');
                }
                
                // List all files in the root of the storage bucket
                const listRef = window.firebase.storageRef(fbStorage, '/');
                const result = await window.firebase.listAll(listRef);
                
                console.log(`[loadStorageFiles] Found ${result.items.length} files in Storage`);
                
                if (result.items.length === 0) {
                    // No files found
                    if (loadingEl) loadingEl.style.display = 'none';
                    if (emptyEl) emptyEl.style.display = 'flex';
                    return;
                }
                
                // Get download URLs for all files
                const filePromises = result.items.map(async (itemRef) => {
                    const url = await window.firebase.getDownloadURL(itemRef);
                    const name = itemRef.name;
                    const fullPath = itemRef.fullPath;
                    
                    // Get file size and last modified (if available via metadata)
                    // Note: getMetadata requires storage.object.get permission
                    // We'll skip it for now to avoid permission issues
                    
                    return {
                        name,
                        fullPath,
                        url,
                        // Extract file extension
                        extension: name.split('.').pop().toLowerCase()
                    };
                });
                
                const files = await Promise.all(filePromises);
                
                console.log('[loadStorageFiles] Files with URLs:', files);
                
                // Render files list
                renderStorageFiles(files);
                
                // Hide loading, show content
                if (loadingEl) loadingEl.style.display = 'none';
                if (contentEl) contentEl.style.display = 'block';
                
            } catch (error) {
                console.error('[loadStorageFiles] Error loading files:', error);
                
                // Show error state
                if (loadingEl) loadingEl.style.display = 'none';
                if (errorEl) errorEl.style.display = 'flex';
                if (errorMessageEl) {
                    errorMessageEl.textContent = `Erro ao carregar arquivos: ${error.message}. Verifique as permissões do Firebase Storage.`;
                }
            }
        }
        
        /**
         * Sanitize HTML to prevent XSS attacks
         * @param {string} str - String to sanitize
         * @returns {string} Sanitized string safe for HTML insertion
         */
        function escapeHtml(str) {
            if (!str) return '';
            const div = document.createElement('div');
            div.textContent = str;
            return div.innerHTML;
        }
        
        /**
         * Get icon color based on file extension
         * @param {string} extension - File extension (lowercase)
         * @returns {string} Hex color code
         */
        function getFileIconColor(extension) {
            const colorMap = {
                'xlsm': '#0891b2',  // Cyan for xlsm (macros)
                'xls': '#6366f1',   // Indigo for old xls
                'xlsx': '#059669'   // Green for xlsx
            };
            return colorMap[extension] || '#059669'; // Default to green
        }
        
        /**
         * Render the list of files from Firebase Storage
         * @param {Array} files - Array of file objects with name, url, extension
         */
        function renderStorageFiles(files) {
            const contentEl = document.getElementById('storage-files-content');
            if (!contentEl) return;
            
            // Filter for Excel files (xlsx, xlsm, xls)
            const excelFiles = files.filter(f => ['xlsx', 'xlsm', 'xls'].includes(f.extension));
            const otherFiles = files.filter(f => !['xlsx', 'xlsm', 'xls'].includes(f.extension));
            
            let html = '';
            
            // Excel files section
            if (excelFiles.length > 0) {
                html += `
                    <div style="margin-bottom: 2rem;">
                        <h3 style="font-size: 1.125rem; font-weight: 600; color: #0f172a; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem;">
                            <svg style="width: 20px; height: 20px; color: #059669;" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            Arquivos Excel (${excelFiles.length})
                        </h3>
                        <div style="display: grid; gap: 0.75rem;">
                `;
                
                excelFiles.forEach(file => {
                    // Get icon color based on extension using helper function
                    const iconColor = getFileIconColor(file.extension);
                    
                    // Sanitize file name and URL to prevent XSS
                    const safeName = escapeHtml(file.name);
                    const safeUrl = escapeHtml(file.url);
                    const safeExtension = escapeHtml(file.extension.toUpperCase());
                    
                    html += `
                        <div style="background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 1rem; display: flex; align-items: center; gap: 1rem; transition: all 0.2s; cursor: pointer; box-shadow: 0 1px 2px rgba(0,0,0,0.05);" 
                             onmouseover="this.style.boxShadow='0 4px 12px rgba(0,0,0,0.1)'; this.style.borderColor='${iconColor}';" 
                             onmouseout="this.style.boxShadow='0 1px 2px rgba(0,0,0,0.05)'; this.style.borderColor='#e5e7eb';">
                            <div style="width: 48px; height: 48px; background: linear-gradient(135deg, ${iconColor}, ${iconColor}dd); border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                                <svg style="width: 28px; height: 28px; color: white;" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                            </div>
                            <div style="flex: 1; min-width: 0;">
                                <h4 style="font-size: 0.95rem; font-weight: 600; color: #0f172a; margin: 0 0 0.25rem 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${safeName}">
                                    ${safeName}
                                </h4>
                                <p style="font-size: 0.8rem; color: #64748b; margin: 0;">
                                    Formato: ${safeExtension}
                                </p>
                            </div>
                            <a href="${safeUrl}" download="${safeName}" style="padding: 0.75rem 1.5rem; background: linear-gradient(135deg, ${iconColor}, ${iconColor}dd); color: white; border-radius: 6px; font-weight: 500; text-decoration: none; display: flex; align-items: center; gap: 0.5rem; transition: all 0.2s; flex-shrink: 0;" 
                               onmouseover="this.style.transform='scale(1.05)';" 
                               onmouseout="this.style.transform='scale(1)';">
                                <svg style="width: 18px; height: 18px;" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                                Baixar
                            </a>
                        </div>
                    `;
                });
                
                html += `
                        </div>
                    </div>
                `;
            }
            
            // Other files section (if any)
            if (otherFiles.length > 0) {
                html += `
                    <div>
                        <h3 style="font-size: 1.125rem; font-weight: 600; color: #0f172a; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem;">
                            <svg style="width: 20px; height: 20px; color: #64748b;" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                            </svg>
                            Outros Arquivos (${otherFiles.length})
                        </h3>
                        <div style="display: grid; gap: 0.75rem;">
                `;
                
                otherFiles.forEach(file => {
                    // Sanitize file name and URL to prevent XSS
                    const safeName = escapeHtml(file.name);
                    const safeUrl = escapeHtml(file.url);
                    const safeExtension = escapeHtml(file.extension.toUpperCase());
                    
                    html += `
                        <div style="background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 1rem; display: flex; align-items: center; gap: 1rem; transition: all 0.2s;">
                            <div style="width: 48px; height: 48px; background: linear-gradient(135deg, #64748b, #475569); border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                                <svg style="width: 28px; height: 28px; color: white;" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                </svg>
                            </div>
                            <div style="flex: 1; min-width: 0;">
                                <h4 style="font-size: 0.95rem; font-weight: 600; color: #0f172a; margin: 0 0 0.25rem 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${safeName}">
                                    ${safeName}
                                </h4>
                                <p style="font-size: 0.8rem; color: #64748b; margin: 0;">
                                    Formato: ${safeExtension}
                                </p>
                            </div>
                            <a href="${safeUrl}" download="${safeName}" style="padding: 0.75rem 1.5rem; background: linear-gradient(135deg, #64748b, #475569); color: white; border-radius: 6px; font-weight: 500; text-decoration: none; display: flex; align-items: center; gap: 0.5rem; transition: all 0.2s; flex-shrink: 0;">
                                <svg style="width: 18px; height: 18px;" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                                Baixar
                            </a>
                        </div>
                    `;
                });
                
                html += `
                        </div>
                    </div>
                `;
            }
            
            contentEl.innerHTML = html;
        }
        
        /**
         * Determines the student type class for color-coding
         * Based on user requirements:
         * - Bolsistas (scholarship students) = Blue
         * - Pagantes (paying students) = Red  
         * - Residentes (resident students) = Green
         * @param {object} aluno - Student data object from EscalaAtual
         * @returns {string} CSS class for the student type
         */
        function getStudentTypeClass(aluno) {
            if (!aluno) return '';
            
            // First try to get the student's info from the main alunos list (richer data)
            const alunoNome = aluno.Aluno || aluno.NomeCompleto || aluno.Nome || '';
            const alunoEmail = aluno.EmailHC || aluno.Email || aluno.email || '';
            
            // Try to find the student in the main list to get Curso information
            let curso = aluno.Curso || aluno.curso || '';
            let tipo = aluno.Tipo || aluno.tipo || aluno.TipoAluno || aluno.tipoAluno || '';
            let categoria = aluno.Categoria || aluno.categoria || '';
            
            // If no curso info in aluno object, try to find in main alunos list
            // Check if appState and alunosMap exist before accessing
            if (!curso && typeof appState !== 'undefined' && appState.alunosMap && alunoEmail) {
                const mainAluno = appState.alunosMap.get(alunoEmail);
                if (mainAluno) {
                    curso = mainAluno.Curso || '';
                    tipo = mainAluno.Tipo || tipo;
                    categoria = mainAluno.Categoria || categoria;
                }
            }
            
            // Normalize strings for comparison
            curso = curso.toLowerCase().trim();
            tipo = tipo.toLowerCase().trim();
            categoria = categoria.toLowerCase().trim();
            const modalidade = (aluno.Modalidade || aluno.modalidade || '').toLowerCase().trim();
            
            // Combined search text
            const searchText = `${curso} ${tipo} ${categoria} ${modalidade}`;
            
            // Check for Residentes (Green) - highest priority
            // Use word boundary patterns to avoid false positives
            const isResidente = 
                /\bresid[eê]ncia\b/i.test(curso) ||
                /\bresidente\b/i.test(tipo) ||
                /\bresidente\b/i.test(categoria) ||
                // Match "Residência - 1º ano", "Residência - 2º ano", etc.
                /residência.*\d.*ano/i.test(curso) ||
                /residencia.*\d.*ano/i.test(curso);
            
            if (isResidente) {
                return 'student-type-residente';
            }
            
            // Check for Bolsistas (Blue)
            const isBolsista = 
                /\bbolsa\b/i.test(searchText) ||
                /\bbolsista\b/i.test(tipo) ||
                /\bbolsista\b/i.test(categoria);
            
            if (isBolsista) {
                return 'student-type-bolsista';
            }
            
            // Check for Pagantes (Red) - includes Aprimoramento students who pay
            const isPagante = 
                /\bpagante\b/i.test(tipo) ||
                /\bpagante\b/i.test(categoria) ||
                /\bpag\b/i.test(tipo) ||
                /\baprimoramento\b/i.test(curso);
            
            if (isPagante) {
                return 'student-type-pagante';
            }
            
            // Default - no special coloring (use default blue)
            return '';
        }
        
        /**
         * Render the escala table for a specific sector
         * @param {string} sector - 'enfermaria', 'uti', or 'cardiopediatria'
         */
        /**
         * Get day of week abbreviation in Portuguese (D, S, T, Q, Q, S, S)
         * @param {number} dayOfWeek - 0 (Sunday) to 6 (Saturday)
         * @returns {string} Abbreviated day name
         */
        function getDayOfWeekAbbr(dayOfWeek) {
            const days = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
            return days[dayOfWeek] || '';
        }
        
        /**
         * Check if a day is weekend (Saturday=6 or Sunday=0)
         * @param {number} dayOfWeek - 0 (Sunday) to 6 (Saturday)
         * @returns {boolean}
         */
        function isWeekend(dayOfWeek) {
            return dayOfWeek === 0 || dayOfWeek === 6;
        }
        
        /**
         * Check if a date is a Brazilian national holiday
         * @param {number} day - Day of month
         * @param {number} month - Month (1-12)
         * @param {number} year - Year
         * @returns {boolean}
         */
        function isBrazilianHoliday(day, month, year) {
            // Fixed Brazilian national holidays (DD/MM)
            const fixedHolidays = [
                '01/01', // Confraternização Universal (New Year)
                '21/04', // Tiradentes
                '01/05', // Dia do Trabalho (Labor Day)
                '07/09', // Independência do Brasil
                '12/10', // Nossa Senhora Aparecida
                '02/11', // Finados
                '15/11', // Proclamação da República
                '25/12', // Natal (Christmas)
            ];
            
            const dateKey = `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}`;
            if (fixedHolidays.includes(dateKey)) {
                return true;
            }
            
            // Calculate Easter-based mobile holidays
            // Using Anonymous Gregorian algorithm
            const a = year % 19;
            const b = Math.floor(year / 100);
            const c = year % 100;
            const d = Math.floor(b / 4);
            const e = b % 4;
            const f = Math.floor((b + 8) / 25);
            const g = Math.floor((b - f + 1) / 3);
            const h = (19 * a + b - d - g + 15) % 30;
            const i = Math.floor(c / 4);
            const k = c % 4;
            const l = (32 + 2 * e + 2 * i - h - k) % 7;
            const m = Math.floor((a + 11 * h + 22 * l) / 451);
            const easterMonth = Math.floor((h + l - 7 * m + 114) / 31);
            const easterDay = ((h + l - 7 * m + 114) % 31) + 1;
            
            const easterDate = new Date(year, easterMonth - 1, easterDay);
            
            // Mobile holidays based on Easter
            const mobileHolidays = [
                new Date(easterDate.getTime() - 47 * 24 * 60 * 60 * 1000), // Carnaval (47 days before Easter)
                new Date(easterDate.getTime() - 46 * 24 * 60 * 60 * 1000), // Carnaval (46 days before Easter)
                new Date(easterDate.getTime() - 2 * 24 * 60 * 60 * 1000),  // Sexta-feira Santa (Good Friday)
                easterDate, // Páscoa (Easter Sunday)
                new Date(easterDate.getTime() + 60 * 24 * 60 * 60 * 1000), // Corpus Christi (60 days after Easter)
            ];
            
            const checkDate = new Date(year, month - 1, day);
            return mobileHolidays.some(holiday => 
                holiday.getDate() === checkDate.getDate() && 
                holiday.getMonth() === checkDate.getMonth()
            );
        }
        
        /**
         * Parse DD/MM date string and calculate day of week for current year
         * @param {string} ddmm - Date in DD/MM format
         * @returns {object} { day, month, dayOfWeek, isWeekend, isHoliday }
         */
        function parseDayMonth(ddmm) {
            const [day, month] = ddmm.split('/').map(Number);
            const year = new Date().getFullYear();
            const date = new Date(year, month - 1, day);
            const dayOfWeek = date.getDay();
            return {
                day,
                month,
                dayOfWeek,
                isWeekend: isWeekend(dayOfWeek),
                isHoliday: isBrazilianHoliday(day, month, year),
                dayAbbr: getDayOfWeekAbbr(dayOfWeek)
            };
        }
        
        /**
         * Get the shift badge class for compact monthly table
         * @param {string} shiftValue - The shift value (M, T, N, MT, etc.)
         * @returns {object} { badgeClass, displayValue }
         */
        function getCompactShiftBadge(shiftValue) {
            const normalized = String(shiftValue || '').trim().toUpperCase();
            
            if (!normalized || normalized === '-') {
                return { badgeClass: 'shift-empty', displayValue: '' };
            }
            
            if (normalized === 'M') {
                return { badgeClass: 'shift-m', displayValue: 'M' };
            }
            if (normalized === 'T') {
                return { badgeClass: 'shift-t', displayValue: 'T' };
            }
            if (normalized === 'N') {
                return { badgeClass: 'shift-n', displayValue: 'N' };
            }
            if (normalized === 'MT' || normalized === 'TM') {
                return { badgeClass: 'shift-mt', displayValue: 'MT' };
            }
            if (normalized === 'FC') {
                return { badgeClass: 'shift-fc', displayValue: 'FC' };
            }
            if (normalized === 'F' || normalized === 'FOLGA') {
                return { badgeClass: 'shift-f', displayValue: 'F' };
            }
            if (normalized === 'AB' || normalized === 'AMBULATORIO' || normalized === 'AMBULATÓRIO') {
                return { badgeClass: 'shift-ab', displayValue: 'AB' };
            }
            if (normalized === 'AULA' || normalized.startsWith('AULA') || normalized === 'HCX' || normalized.startsWith('HCX ')) {
                return { badgeClass: 'shift-aula', displayValue: 'AULA' };
            }
            
            // Other values - show as-is with empty styling
            return { badgeClass: 'shift-empty', displayValue: normalized };
        }
        
        /**
         * Render Escala Atual Table - Minimalist Excel-style Layout
         * Professional compact schedule view similar to Excel spreadsheets
         * @param {string} sector - The sector to render (enfermaria, uti, cardiopediatria)
         */
        /**
         * Renders the monthly Escala table from Firebase Escala sheets.
         * Aggregates data from all Escala sheets (Escala1, Escala2, etc.) and displays
         * students grouped by sector in a professional Excel-like table format.
         * 
         * Features:
         * - Automatic sector grouping (Enfermaria, UTI, Cardiopediatria, etc.)
         * - Period detection from date range
         * - Weekend and today highlighting
         * - Shift badges (M, T, N, MT, FC, F, AULA, AB)
         * - Student type color-coding (Bolsista=Blue, Pagante=Red, Residente=Green)
         * 
         * @returns {void} Updates the DOM with the rendered schedule table
         */
        function renderMonthlyEscalaTable() {
            console.log(`[renderMonthlyEscalaTable] NEW IMPLEMENTATION - Building from Escala sheets data...`);
            
            const loadingEl = document.getElementById('escala-mensal-loading');
            const emptyEl = document.getElementById('escala-mensal-empty');
            const contentEl = document.getElementById('escala-mensal-content');
            
            if (!loadingEl || !emptyEl || !contentEl) {
                console.error('[renderMonthlyEscalaTable] Container elements not found');
                return;
            }
            
            // NEW APPROACH: Pull from appState.escalas (Escala1, Escala2, etc.)
            // These contain the real student schedule data from Firebase
            const escalasData = appState.escalas || {};
            const escalasKeys = Object.keys(escalasData).filter(key => key.match(/^Escala\d+$/i));
            
            if (escalasKeys.length === 0) {
                console.warn('[renderMonthlyEscalaTable] No Escala sheets found in Firebase');
                loadingEl.style.display = 'none';
                emptyEl.style.display = 'flex';
                contentEl.style.display = 'none';
                emptyEl.querySelector('span').textContent = 'Nenhum dado de escala encontrado no Firebase.';
                return;
            }
            
            console.log(`[renderMonthlyEscalaTable] Found ${escalasKeys.length} Escala sheets:`, escalasKeys.join(', '));
            
            // Aggregate all students from all Escala sheets
            const allStudents = [];
            const allDates = new Set();
            let periodLabel = '';
            
            escalasKeys.forEach(escalaKey => {
                const escalaData = escalasData[escalaKey];
                if (escalaData && escalaData.alunos && Array.isArray(escalaData.alunos)) {
                    // Add each student with their schedule data
                    escalaData.alunos.forEach(aluno => {
                        if (aluno && (aluno.NomeCompleto || aluno.Aluno || aluno.Nome)) {
                            allStudents.push({
                                ...aluno,
                                _escalaSource: escalaKey
                            });
                        }
                    });
                    
                    // Collect all dates
                    if (escalaData.headersDay && Array.isArray(escalaData.headersDay)) {
                        escalaData.headersDay.forEach(date => allDates.add(date));
                    }
                }
            });
            
            // Sort dates chronologically
            const sortedDates = Array.from(allDates).sort((a, b) => {
                const [dayA, monthA] = a.split('/').map(Number);
                const [dayB, monthB] = b.split('/').map(Number);
                if (monthA !== monthB) return monthA - monthB;
                return dayA - dayB;
            });
            
            // Determine period label from dates
            if (sortedDates.length > 0) {
                const firstDate = sortedDates[0];
                const lastDate = sortedDates[sortedDates.length - 1];
                const [, firstMonth] = firstDate.split('/').map(Number);
                const [, lastMonth] = lastDate.split('/').map(Number);
                
                // Get current year dynamically
                const currentYear = new Date().getFullYear();
                
                const monthNames = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                                   'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
                
                if (firstMonth === lastMonth) {
                    periodLabel = `${monthNames[firstMonth]} ${currentYear} (${firstDate} a ${lastDate})`;
                } else {
                    periodLabel = `${monthNames[firstMonth]}-${monthNames[lastMonth]} ${currentYear} (${firstDate} a ${lastDate})`;
                }
            }
            
            // Check if we have data
            if (allStudents.length === 0 || sortedDates.length === 0) {
                console.warn('[renderMonthlyEscalaTable] No students or dates found in Escala sheets');
                loadingEl.style.display = 'none';
                emptyEl.style.display = 'flex';
                contentEl.style.display = 'none';
                return;
            }
            
            console.log(`[renderMonthlyEscalaTable] Aggregated ${allStudents.length} students with ${sortedDates.length} dates`);
            console.log(`[renderMonthlyEscalaTable] Period: ${periodLabel}`);
            
            // Hide loading, show content
            loadingEl.style.display = 'none';
            emptyEl.style.display = 'none';
            contentEl.style.display = 'block';
            
            // Get today's date in DD/MM format for highlighting
            const todayBR = appState.todayBR || new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
            
            // Parse day info for each date (for weekday abbreviations and weekend highlighting)
            const dayInfo = sortedDates.map(day => ({
                date: day,
                ...parseDayMonth(day)
            }));
            
            // Group students by sector (Unidade) for better organization
            const studentsBySector = {};
            allStudents.forEach(aluno => {
                const unidade = aluno.Unidade || aluno.unidade || aluno.Setor || aluno.setor || 'Outros';
                if (!studentsBySector[unidade]) {
                    studentsBySector[unidade] = [];
                }
                studentsBySector[unidade].push(aluno);
            });
            
            // Sort sectors (prioritize Enfermaria, UTI, Cardiopediatria)
            const sectorOrder = ['Enfermaria', 'UTI', 'Cardiopediatria'];
            const sortedSectors = Object.keys(studentsBySector).sort((a, b) => {
                const indexA = sectorOrder.indexOf(a);
                const indexB = sectorOrder.indexOf(b);
                if (indexA !== -1 && indexB !== -1) return indexA - indexB;
                if (indexA !== -1) return -1;
                if (indexB !== -1) return 1;
                return a.localeCompare(b);
            });
            
            // Filter by selected sector if needed (for now, show all)
            // In the future, you could filter based on the `sector` parameter
            
            console.log(`[renderMonthlyEscalaTable] Students grouped by ${sortedSectors.length} sectors:`, sortedSectors.join(', '));
            
            // Build minimalist Excel-style table HTML
            let html = '';
            
            // Table header with period information
            html += '<div class="escala-mensal-header">';
            html += '  <div class="escala-mensal-header-title">';
            html += '    <h3 class="escala-mensal-header-main">Escala do Programa de Aprimoramento</h3>';
            html += '    <p class="escala-mensal-header-sub">Fisioterapia Cardiovascular e Respiratória - InCor</p>';
            html += '  </div>';
            html += `  <span class="escala-mensal-header-periodo">${escapeHtml(periodLabel)}</span>`;
            html += '</div>';
            
            // Table wrapper for horizontal scroll
            html += '<div class="escala-mensal-table-wrapper">';
            html += '<table class="escala-mensal-table">';
            
            // === TABLE HEADER ===
            html += '<thead>';
            
            // Row 1: Day numbers
            html += '<tr>';
            html += '<th class="col-nome">Nome do Aluno</th>';
            dayInfo.forEach(info => {
                const isToday = info.date === todayBR;
                const weekendClass = info.isWeekend ? 'weekend' : '';
                const holidayClass = '';  // TODO: Add holiday detection if needed
                const todayClass = isToday ? 'today-col' : '';
                html += `<th class="${weekendClass} ${holidayClass} ${todayClass}">${info.day}</th>`;
            });
            html += '</tr>';
            
            // Row 2: Day of week abbreviations (D, S, T, Q, Q, S, S)
            html += '<tr>';
            html += '<th class="col-nome"></th>';
            dayInfo.forEach(info => {
                const isToday = info.date === todayBR;
                const weekendClass = info.isWeekend ? 'weekend' : '';
                const holidayClass = '';
                const todayClass = isToday ? 'today-col' : '';
                html += `<th class="${weekendClass} ${holidayClass} ${todayClass}">${info.dayAbbr}</th>`;
            });
            html += '</tr>';
            
            html += '</thead>';
            
            // === TABLE BODY ===
            html += '<tbody>';
            
            const totalCols = 1 + sortedDates.length;
            
            // Render students grouped by sector
            sortedSectors.forEach(sectorName => {
                const sectorStudents = studentsBySector[sectorName];
                
                // Add sector header row
                html += `
                    <tr class="escala-mensal-sector-row">
                        <td class="col-nome" colspan="${totalCols}">
                            <span class="escala-mensal-sector-title">${escapeHtml(sectorName.toUpperCase())}</span>
                        </td>
                    </tr>
                `;
                
                // Render each student in this sector
                sectorStudents.forEach(aluno => {
                    const nome = aluno.NomeCompleto || aluno.Aluno || aluno.Nome || aluno.nomeCompleto || aluno.nome || '';
                    const supervisor = aluno.Supervisor || aluno.supervisor || '';
                    
                    // Skip if no name
                    if (!nome || nome.trim() === '') return;
                    
                    // Determine student type for color-coding
                    const studentTypeClass = getStudentTypeClass(aluno);
                    let nameTypeClass = '';
                    if (studentTypeClass.includes('pagante')) {
                        nameTypeClass = 'tipo-pagante';
                    } else if (studentTypeClass.includes('bolsista')) {
                        nameTypeClass = 'tipo-bolsista';
                    } else if (studentTypeClass.includes('residente')) {
                        nameTypeClass = 'tipo-residente';
                    }
                    
                    html += '<tr>';
                    
                    // Name cell
                    html += `
                        <td class="col-nome">
                            <div class="escala-mensal-nome">
                                <span class="escala-mensal-nome-aluno ${nameTypeClass}">${escapeHtml(nome)}</span>
                                ${supervisor ? `<span class="escala-mensal-nome-supervisor">Sup: ${escapeHtml(supervisor)}</span>` : ''}
                            </div>
                        </td>
                    `;
                    
                    // Day cells
                    dayInfo.forEach(info => {
                        const isToday = info.date === todayBR;
                        const weekendClass = info.isWeekend ? 'weekend' : '';
                        const holidayClass = '';
                        const todayClass = isToday ? 'today-col' : '';
                        
                        // Try multiple key formats to find the value
                        let value = '';
                        
                        // Try DD/MM format first
                        if (aluno[info.date] !== undefined) {
                            value = aluno[info.date];
                        } else {
                            // Try various underscore formats
                            const possibleKeys = [
                                `${info.day}_${String(info.month).padStart(2, '0')}`,  // D_MM
                                `${String(info.day).padStart(2, '0')}_${info.month}`,  // DD_M
                                `${String(info.day).padStart(2, '0')}_${String(info.month).padStart(2, '0')}`, // DD_MM
                                `${info.day}_${info.month}` // D_M
                            ];
                            
                            for (const key of possibleKeys) {
                                if (aluno[key] !== undefined && aluno[key] !== null && String(aluno[key]).trim() !== '') {
                                    value = aluno[key];
                                    break;
                                }
                            }
                        }
                        
                        // Get badge styling for compact display
                        const { badgeClass, displayValue } = getCompactShiftBadge(value);
                        
                        html += `
                            <td class="${weekendClass} ${holidayClass} ${todayClass}">
                                <span class="escala-mensal-shift ${badgeClass}">${escapeHtml(displayValue)}</span>
                            </td>
                        `;
                    });
                    
                    html += '</tr>';
                });
            });
            
            html += '</tbody></table>';
            html += '</div>'; // Close table wrapper
            
            contentEl.innerHTML = html;
            
            console.log(`[renderMonthlyEscalaTable] ✅ Rendered ${allStudents.length} students grouped in ${sortedSectors.length} sectors with ${sortedDates.length} days`);
        }

        /**
         * [NEW] Render Escala Atual Table - Reference schedules from EscalaAtual Firebase data
         * Aggregates data from EscalaAtualUTI, EscalaAtualCardiopediatria, EscalaAtualEnfermaria
         * Shows shift codes (M, T, N, MT, FC, F, AULA, AB) for each student by date
         */
        function renderEscalaAtualTable() {
            console.log(`[renderEscalaAtualTable] Rendering reference schedules from EscalaAtual data...`);
            
            const loadingEl = document.getElementById('escala-atual-loading');
            const emptyEl = document.getElementById('escala-atual-empty');
            const contentEl = document.getElementById('escala-atual-content');
            
            if (!loadingEl || !emptyEl || !contentEl) {
                console.error('[renderEscalaAtualTable] Container elements not found');
                return;
            }
            
            // Collect data from all three EscalaAtual sources
            const escalaAtualData = {
                UTI: appState.escalaAtualUTI || null,
                Cardiopediatria: appState.escalaAtualCardiopediatria || null,
                Enfermaria: appState.escalaAtualEnfermaria || null
            };
            
            // Aggregate all students from all sectors
            const allStudents = [];
            const allDates = new Set();
            
            Object.entries(escalaAtualData).forEach(([sectorName, sectorData]) => {
                if (sectorData && sectorData.alunos && Array.isArray(sectorData.alunos)) {
                    sectorData.alunos.forEach(aluno => {
                        if (aluno && (aluno.Aluno || aluno.NomeCompleto || aluno.Nome)) {
                            allStudents.push({
                                ...aluno,
                                _sector: sectorName,
                                _sectorData: sectorData
                            });
                        }
                    });
                    
                    // Collect all dates
                    if (sectorData.headersDay && Array.isArray(sectorData.headersDay)) {
                        sectorData.headersDay.forEach(date => allDates.add(date));
                    }
                }
            });
            
            // Check if we have data
            if (allStudents.length === 0 || allDates.size === 0) {
                console.warn('[renderEscalaAtualTable] No students or dates found in EscalaAtual data');
                loadingEl.style.display = 'none';
                emptyEl.style.display = 'flex';
                contentEl.style.display = 'none';
                emptyEl.querySelector('span').textContent = 'Nenhum dado de Escala Atual encontrado no Firebase.';
                return;
            }
            
            // Sort dates chronologically
            const sortedDates = Array.from(allDates).sort((a, b) => {
                const [dayA, monthA] = a.split('/').map(Number);
                const [dayB, monthB] = b.split('/').map(Number);
                if (monthA !== monthB) return monthA - monthB;
                return dayA - dayB;
            });
            
            // Determine period label from dates
            let periodLabel = '';
            if (sortedDates.length > 0) {
                const firstDate = sortedDates[0];
                const lastDate = sortedDates[sortedDates.length - 1];
                const [, firstMonth] = firstDate.split('/').map(Number);
                const [, lastMonth] = lastDate.split('/').map(Number);
                
                // Get current year dynamically
                const currentYear = new Date().getFullYear();
                
                const monthNames = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                                   'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
                
                if (firstMonth === lastMonth) {
                    periodLabel = `${monthNames[firstMonth]} ${currentYear} (${firstDate} a ${lastDate})`;
                } else {
                    periodLabel = `${monthNames[firstMonth]}-${monthNames[lastMonth]} ${currentYear} (${firstDate} a ${lastDate})`;
                }
            }
            
            console.log(`[renderEscalaAtualTable] Aggregated ${allStudents.length} students with ${sortedDates.length} dates`);
            console.log(`[renderEscalaAtualTable] Period: ${periodLabel}`);
            
            // Hide loading, show content
            loadingEl.style.display = 'none';
            emptyEl.style.display = 'none';
            contentEl.style.display = 'block';
            
            // Get today's date in DD/MM format for highlighting
            const todayBR = appState.todayBR || new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
            
            // Parse day info for each date (for weekday abbreviations and weekend highlighting)
            const dayInfo = sortedDates.map(day => ({
                date: day,
                ...parseDayMonth(day)
            }));
            
            // Group students by sector
            const studentsBySector = {};
            allStudents.forEach(student => {
                const sector = student._sector || 'Outros';
                if (!studentsBySector[sector]) {
                    studentsBySector[sector] = [];
                }
                studentsBySector[sector].push(student);
            });
            
            // Sort sectors (UTI, Cardiopediatria, Enfermaria, then others alphabetically)
            const sectorOrder = ['UTI', 'Cardiopediatria', 'Enfermaria'];
            const sortedSectors = Object.keys(studentsBySector).sort((a, b) => {
                const indexA = sectorOrder.indexOf(a);
                const indexB = sectorOrder.indexOf(b);
                if (indexA !== -1 && indexB !== -1) return indexA - indexB;
                if (indexA !== -1) return -1;
                if (indexB !== -1) return 1;
                return a.localeCompare(b);
            });
            
            console.log(`[renderEscalaAtualTable] Students grouped by ${sortedSectors.length} sectors:`, sortedSectors.join(', '));
            
            // Build the Excel-style table HTML
            // NOTE: Reusing escala-mensal CSS classes as they provide the exact styling we need
            // This avoids code duplication and maintains consistency between both tabs
            let tableHTML = `
                <div class="escala-mensal-header">
                    <h2 class="escala-mensal-title">Escala de Referência - ${periodLabel}</h2>
                    <p class="escala-mensal-subtitle">Códigos de turno por aluno e data</p>
                </div>
                
                <div class="escala-mensal-table-wrapper">
                    <table class="escala-mensal-table">
                        <thead>
                            <tr class="header-dias">
                                <th class="col-nome sticky-col">Nome / Supervisor</th>
            `;
            
            // Day number headers
            dayInfo.forEach(info => {
                const isToday = info.date === todayBR;
                const isWeekend = info.dayIndex === 0 || info.dayIndex === 6;
                const classes = [];
                if (isWeekend) classes.push('weekend');
                if (isToday) classes.push('today-col');
                
                tableHTML += `<th class="${classes.join(' ')}">${info.day}</th>`;
            });
            
            tableHTML += `
                            </tr>
                            <tr class="header-dia-semana">
                                <th class="col-nome sticky-col">Setor</th>
            `;
            
            // Day of week headers (D, S, T, Q, Q, S, S)
            dayInfo.forEach(info => {
                const isToday = info.date === todayBR;
                const isWeekend = info.dayIndex === 0 || info.dayIndex === 6;
                const classes = [];
                if (isWeekend) classes.push('weekend');
                if (isToday) classes.push('today-col');
                
                tableHTML += `<th class="${classes.join(' ')}">${info.dayOfWeekAbbr}</th>`;
            });
            
            tableHTML += `
                            </tr>
                        </thead>
                        <tbody>
            `;
            
            // Render students grouped by sector
            sortedSectors.forEach(sector => {
                const students = studentsBySector[sector];
                
                // Sector header row
                tableHTML += `
                    <tr class="escala-mensal-sector-row">
                        <td colspan="${sortedDates.length + 1}">
                            <div class="escala-mensal-sector-header">
                                <span class="escala-mensal-sector-name">${sector}</span>
                                <span class="escala-mensal-sector-count">${students.length} ${students.length === 1 ? 'aluno' : 'alunos'}</span>
                            </div>
                        </td>
                    </tr>
                `;
                
                // Student rows
                students.forEach(student => {
                    const studentName = student.Aluno || student.NomeCompleto || student.Nome || 'Sem nome';
                    const supervisor = student.Supervisor || '';
                    const horario = student.Horario || student['Horário'] || '';
                    const curso = student.Curso || '';
                    
                    // Determine student type for color coding
                    let tipoClass = 'tipo-bolsista'; // default
                    if (curso) {
                        const cursoLower = curso.toLowerCase();
                        if (cursoLower.includes('pagante') || cursoLower.includes('pago')) {
                            tipoClass = 'tipo-pagante';
                        } else if (cursoLower.includes('residente') || cursoLower.includes('residência')) {
                            tipoClass = 'tipo-residente';
                        }
                    }
                    
                    tableHTML += `<tr class="row-aluno">`;
                    tableHTML += `
                        <td class="col-nome sticky-col">
                            <div class="escala-mensal-nome-aluno ${tipoClass}">${studentName}</div>
                            ${supervisor ? `<div class="escala-mensal-nome-supervisor">${supervisor}</div>` : ''}
                            ${horario ? `<div class="escala-mensal-horario">${horario}</div>` : ''}
                        </td>
                    `;
                    
                    // Render shift codes for each date
                    dayInfo.forEach(info => {
                        const isToday = info.date === todayBR;
                        const isWeekend = info.dayIndex === 0 || info.dayIndex === 6;
                        const classes = [];
                        if (isWeekend) classes.push('weekend');
                        if (isToday) classes.push('today-col');
                        
                        // Try to get shift value from student data
                        // Date could be in formats: DD/MM, D_MM, DD_M, D_M
                        let shiftValue = '';
                        const dateFormats = [
                            info.date, // DD/MM
                            `${info.day}_${info.month}`, // DD_MM
                            `${parseInt(info.day, 10)}_${info.month}`, // D_MM
                            `${info.day}_${parseInt(info.month, 10)}`, // DD_M
                            `${parseInt(info.day, 10)}_${parseInt(info.month, 10)}` // D_M
                        ];
                        
                        for (const format of dateFormats) {
                            if (student[format]) {
                                shiftValue = String(student[format]).trim();
                                break;
                            }
                        }
                        
                        // Normalize shift value (uppercase, remove spaces)
                        shiftValue = shiftValue.toUpperCase().replace(/\s+/g, '');
                        
                        // Render shift badge
                        let shiftHTML = '';
                        if (shiftValue && shiftValue !== '-') {
                            const shiftClass = `shift-${shiftValue.toLowerCase()}`;
                            shiftHTML = `<span class="escala-mensal-shift ${shiftClass}">${shiftValue}</span>`;
                        } else if (shiftValue === '-') {
                            shiftHTML = `<span class="escala-mensal-shift shift-empty">-</span>`;
                        }
                        
                        tableHTML += `<td class="${classes.join(' ')}">${shiftHTML}</td>`;
                    });
                    
                    tableHTML += `</tr>`;
                });
            });
            
            tableHTML += `
                        </tbody>
                    </table>
                </div>
            `;
            
            // Render the table
            contentEl.innerHTML = tableHTML;
            
            console.log(`[renderEscalaAtualTable] ✅ Rendered ${allStudents.length} students grouped in ${sortedSectors.length} sectors with ${sortedDates.length} days`);
        }

        // --- CÁLCULOS AUXILIARES ---
        function parseNota(notaStr) {
            if (notaStr === null || notaStr === undefined) return 0;
            const str = String(notaStr).trim();
            if (str === '') return 0;
            const n = parseFloat(str.replace('R$', '').replace(/\s/g, '').replace(',', '.'));
            return isNaN(n) ? 0 : n;
        }

        /**
         * Formata um número no padrão brasileiro (vírgula como separador decimal)
         * @param {number} value - O valor numérico a ser formatado
         * @param {number} decimals - Número de casas decimais (padrão: 1)
         * @returns {string} Número formatado no padrão pt-BR
         */
        function formatarNota(value, decimals = 1) {
            if (value == null || isNaN(value)) return 'N/A';
            return value.toLocaleString('pt-BR', { 
                minimumFractionDigits: decimals, 
                maximumFractionDigits: decimals 
            });
        }

        /**
         * Formata nomes de módulos de notas práticas para exibição amigável
         * Converte: "NotasPraticas3" → "Módulo de Avaliação Prática 03"
         *           "NP_Modulo5" → "Módulo de Avaliação Prática 05"
         *           "np3" → "Módulo de Avaliação Prática 03"
         */
        function formatarNomeModulo(nomeOriginal) {
            if (!nomeOriginal) return 'Avaliação Prática';
            
            // Try to extract module number from various formats
            const patterns = [
                /NotasPraticas(\d+)/i,
                /NP[_-]?(\d+)/i,
                /Modulo[_-]?(\d+)/i,
                /Pratica[_-]?(\d+)/i,
                /^np(\d+)$/i,
                /(\d+)/  // Fallback: any number
            ];
            
            for (const pattern of patterns) {
                const match = nomeOriginal.match(pattern);
                if (match && match[1]) {
                    const numero = String(match[1]).padStart(2, '0');
                    return `Módulo de Avaliação Prática ${numero}`;
                }
            }
            
            // If no number found, return a cleaned version of the original name
            return nomeOriginal
                .replace(/NotasPraticas/gi, 'Avaliação Prática')
                .replace(/NP[_-]?/gi, 'Avaliação Prática ')
                .replace(/_/g, ' ')
                .replace(/-/g, ' ')
                .trim() || 'Avaliação Prática';
        }

        // [ORION] Helper para centralizar a busca de dados do aluno
        function findDataByStudent(emailNormalizado, alunoNomeNormalizado) {
            // Escalas
            const escalas = Object.values(appState.escalas).map(e => {
                const a = (e.alunos || []).find(x => x && 
                    ((x.EmailHC && normalizeString(x.EmailHC) === emailNormalizado) || 
                     (x.NomeCompleto && normalizeString(x.NomeCompleto) === alunoNomeNormalizado))
                );
                return a ? { nomeEscala: e.nomeEscala, headersDay: e.headersDay, tipo: e.tipo, numero: e.numero, ...a } : null;
            }).filter(Boolean); // Filtra nulos

            // Faltas
            const faltas = appState.ausenciasReposicoes.filter(f => f && 
                ((f.EmailHC && normalizeString(f.EmailHC) === emailNormalizado) || 
                 (f.NomeCompleto && normalizeString(f.NomeCompleto) === alunoNomeNormalizado))
            );

            // Notas Teóricas
            console.log('[findDataByStudent] Buscando Notas Teóricas para:', { emailNormalizado, alunoNomeNormalizado });
            console.log('[findDataByStudent] appState.notasTeoricas:', appState.notasTeoricas);
            console.log('[findDataByStudent] Tipo de appState.notasTeoricas:', typeof appState.notasTeoricas);
            console.log('[findDataByStudent] Tem registros?', appState.notasTeoricas?.registros !== undefined);
            console.log('[findDataByStudent] Total de registros em notasTeoricas:', appState.notasTeoricas.registros?.length || 0);
            
            // Handle different possible data structures
            let notasTeoricasArray = [];
            if (appState.notasTeoricas) {
                if (Array.isArray(appState.notasTeoricas)) {
                    // If notasTeoricas is already an array
                    notasTeoricasArray = appState.notasTeoricas;
                    console.log('[findDataByStudent] notasTeoricas é um array direto');
                } else if (appState.notasTeoricas.registros && Array.isArray(appState.notasTeoricas.registros)) {
                    // If notasTeoricas has a registros property
                    notasTeoricasArray = appState.notasTeoricas.registros;
                    console.log('[findDataByStudent] notasTeoricas tem propriedade registros');
                } else if (typeof appState.notasTeoricas === 'object') {
                    // If it's an object but not in expected structure
                    console.warn('[findDataByStudent] ⚠️ notasTeoricas tem estrutura inesperada:', Object.keys(appState.notasTeoricas));
                }
            }
            
            // Log first 3 records to see structure
            if (notasTeoricasArray.length > 0) {
                console.log('[findDataByStudent] Primeiros 3 registros de notasTeoricas:', 
                    notasTeoricasArray.slice(0, 3).map(r => ({
                        EmailHC: r?.EmailHC,
                        NomeCompleto: r?.NomeCompleto,
                        emailHC: r?.emailHC,
                        nomeCompleto: r?.nomeCompleto,
                        EmailHC_normalized: r?.EmailHC ? normalizeString(r.EmailHC) : null,
                        NomeCompleto_normalized: r?.NomeCompleto ? normalizeString(r.NomeCompleto) : null,
                        allKeys: Object.keys(r || {}).slice(0, 10)
                    }))
                );
            }
            
            // Try multiple field name variants for robustness
            const notasT = notasTeoricasArray.find(n => {
                if (!n) return false;
                
                // Try EmailHC variants using constant
                const hasMatchingEmail = EMAIL_FIELD_VARIANTS.some(field => 
                    n[field] && normalizeString(n[field]) === emailNormalizado
                );
                
                // Try NomeCompleto variants using constant
                const hasMatchingName = NAME_FIELD_VARIANTS.some(field => 
                    n[field] && normalizeString(n[field]) === alunoNomeNormalizado
                );
                
                return hasMatchingEmail || hasMatchingName;
            });
            
            console.log('[findDataByStudent] Notas Teóricas encontradas:', notasT ? 'SIM' : 'NÃO');
            if (notasT) {
                console.log('[findDataByStudent] Campos da nota teórica:', Object.keys(notasT));
            } else if (notasTeoricasArray.length > 0) {
                console.warn('[findDataByStudent] ⚠️ ATENÇÃO: Existem registros de notas teóricas, mas nenhum match encontrado!');
                console.warn('[findDataByStudent] Valores buscados:', { emailNormalizado, alunoNomeNormalizado });
            }

            // Notas Práticas - with deduplication and improved field matching
            console.log('[findDataByStudent] Buscando Notas Práticas para:', { emailNormalizado, alunoNomeNormalizado });
            const notasPRaw = Object.values(appState.notasPraticas).flatMap(p => {
                const matchedRecords = (p.registros || []).filter(x => {
                    if (!x) return false;
                    
                    // Try EmailHC variants for matching using constant
                    const hasMatchingEmail = EMAIL_FIELD_VARIANTS.some(field => 
                        x[field] && normalizeString(x[field]) === emailNormalizado
                    );
                    
                    // Try NomeCompleto variants for matching using constant
                    const hasMatchingName = NAME_FIELD_VARIANTS.some(field => 
                        x[field] && normalizeString(x[field]) === alunoNomeNormalizado
                    );
                    
                    return hasMatchingEmail || hasMatchingName;
                });
                
                return matchedRecords.map(i => ({ nomePratica: p.nomePratica, ...i }));
            });
            
            console.log(`[findDataByStudent] Notas Práticas encontradas: ${notasPRaw.length}`);
            
            // Remove duplicates based on _uniqueId (same evaluation appearing in multiple sheets)
            const seenIds = new Set();
            const notasP = notasPRaw.filter(nota => {
                if (nota._uniqueId) {
                    if (seenIds.has(nota._uniqueId)) {
                        console.log(`[findDataByStudent] Removed duplicate NotasPraticas: ${nota.nomePratica} (ID: ${nota._uniqueId})`);
                        return false; // Skip duplicate
                    }
                    seenIds.add(nota._uniqueId);
                    return true;
                }
                // If no _uniqueId, keep it (shouldn't happen with validation system, but be safe)
                console.warn(`[findDataByStudent] NotasPraticas record without _uniqueId found: ${nota.nomePratica}`);
                return true;
            });
            
            if (notasPRaw.length > notasP.length) {
                console.log(`[findDataByStudent] ✅ Deduplicated NotasPraticas: ${notasPRaw.length} → ${notasP.length} (removed ${notasPRaw.length - notasP.length} duplicates)`);
            }

            return { escalas, faltas, notasT, notasP };
        }
        
        function calculateAveragesAndDistribution() {
            const activeStudents = appState.alunos.filter(s => s.Status === 'Ativo');
            const activeStudentMap = new Map();
            activeStudents.forEach(s => {
                if (s.EmailHC) activeStudentMap.set(normalizeString(s.EmailHC), s);
                if (s.NomeCompleto) activeStudentMap.set(normalizeString(s.NomeCompleto), s);
            });

            // --- Teóricas (com filtro R2) - with improved field matching ---
            const tSums = {}; const tCounts = {};
            // Map to track canonical key names (normalized -> original Firebase key)
            const canonicalKeyMap = new Map();
            
            if(appState.notasTeoricas?.registros){
                appState.notasTeoricas.registros.forEach(r => {
                    // Use helper function for robust field matching
                    const rEmail = getFieldValue(r, EMAIL_FIELD_VARIANTS);
                    const rEmailNorm = normalizeString(rEmail);
                    const rNome = getFieldValue(r, NAME_FIELD_VARIANTS);
                    const rNomeNorm = normalizeString(rNome);
                    
                    const student = activeStudentMap.get(rEmailNorm) || activeStudentMap.get(rNomeNorm);

                    if(student && student.Curso !== 'Residência - 2º ano' && student.Curso !== 'Residência  - 2º ano'){
                        // Track which normalized keys we've already processed for THIS record
                        // to avoid counting variants (e.g., MediaFisio1, mediaFisio1, _media_fisio1)
                        const processedKeysForRecord = new Set();
                        
                        Object.keys(r).forEach(k => {
                            // Exclude known non-grade fields (case-insensitive) using module-level Set
                            const kUpper = k.toUpperCase();
                            if(!EXCLUDED_FIELDS_SET.has(kUpper) && k.trim() !== ''){
                                const n = parseNota(r[k]);
                                if(n > 0){
                                    // Normalize key to detect variants
                                    const kNormalized = normalizeKeyForDeduplication(k);
                                    
                                    // Skip if we've already processed a variant of this key for this record
                                    if (processedKeysForRecord.has(kNormalized)) {
                                        return;
                                    }
                                    processedKeysForRecord.add(kNormalized);
                                    
                                    // Determine the canonical key to use
                                    // Prefer: 1) existing canonical key, 2) key with accents (proper formatting)
                                    let canonicalKey = canonicalKeyMap.get(kNormalized);
                                    if (!canonicalKey) {
                                        // First key becomes canonical
                                        canonicalKey = k;
                                        canonicalKeyMap.set(kNormalized, canonicalKey);
                                    } else if (keyHasAccents(k) && !keyHasAccents(canonicalKey)) {
                                        // Update to key with accents (likely original Firebase name)
                                        canonicalKeyMap.set(kNormalized, k);
                                        // Transfer sums/counts to new canonical key (use 'in' to handle 0 values)
                                        if (canonicalKey in tSums && canonicalKey in tCounts) {
                                            tSums[k] = tSums[canonicalKey];
                                            tCounts[k] = tCounts[canonicalKey];
                                            delete tSums[canonicalKey];
                                            delete tCounts[canonicalKey];
                                        }
                                        canonicalKey = k;
                                    }
                                    
                                    tSums[canonicalKey] = (tSums[canonicalKey] || 0) + n;
                                    tCounts[canonicalKey] = (tCounts[canonicalKey] || 0) + 1;
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
            
            // --- Práticas (SEM filtro R2) - with improved field matching ---
            const pSums = {}; const pCounts = {};
            let oPSum = 0; let oPCount = 0;
            if(appState.notasPraticas && typeof appState.notasPraticas === 'object'){
                Object.values(appState.notasPraticas).forEach(p => { 
                    const pNome = p.nomePratica;
                    if (!pSums[pNome]) { pSums[pNome] = 0; pCounts[pNome] = 0; }
                    if(p && p.registros){
                        p.registros.forEach(r => {
                            // Use helper function for robust field matching
                            const rEmail = getFieldValue(r, EMAIL_FIELD_VARIANTS);
                            const rEmailNorm = normalizeString(rEmail);
                            const rNome = getFieldValue(r, NAME_FIELD_VARIANTS);
                            const rNomeNorm = normalizeString(rNome);
                            
                            const isActive = activeStudentMap.has(rEmailNorm) || activeStudentMap.has(rNomeNorm);
                            if(r && isActive){
                                // More flexible pattern to find the average field
                                const kM = Object.keys(r).find(k => 
                                    /MÉDIA.*NOTA.*FINAL/i.test(k) || 
                                    /MEDIA.*NOTA.*FINAL/i.test(k) ||
                                    /MÉDIA.*FINAL/i.test(k) ||
                                    /MEDIA.*FINAL/i.test(k) ||
                                    /NOTA.*FINAL/i.test(k)
                                ) || null;
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
                
                // Log data state for debugging
                console.log('[renderAtAGlance] Renderizando dashboard InCor com:', {
                    totalAlunos: tS,
                    alunosAtivos: aS,
                    reposiçõesPendentes: pR
                });
                
                const {
                    overallTheoreticalAvg:oTAvg, 
                    theoreticalAverages:tAvgs, 
                    overallPracticalAvg:oPAvg, 
                    practicalAverages:pAvgs, 
                    courseDistribution:cDist
                } = calculateAveragesAndDistribution();
                
                // === NÍVEL 1: KPIs com Status Semântico ===
                document.getElementById('kpi-total-students').textContent = tS;
                document.getElementById('kpi-active-students').textContent = aS;
                document.getElementById('kpi-pending-replacements').textContent = pR;
                document.getElementById('kpi-avg-theoretical').textContent = oTAvg > 0 ? oTAvg.toFixed(1) : 'N/A';
                document.getElementById('kpi-avg-practical').textContent = oPAvg > 0 ? oPAvg.toFixed(1) : 'N/A';
                
                // Calculate today's shifts from escala
                const todayShifts = calculateTodayShifts();
                const todayShiftsEl = document.getElementById('kpi-today-shifts');
                if (todayShiftsEl) {
                    todayShiftsEl.textContent = todayShifts;
                }
                
                // Update semantic status for KPIs
                updateKPISemanticStatus('kpi-card-frequency', tS, aS);
                updateKPISemanticStatus('kpi-card-pending', pR);
                updateKPISemanticStatus('kpi-card-shifts', todayShifts);
                updateKPISemanticStatus('kpi-card-theoretical', oTAvg);
                updateKPISemanticStatus('kpi-card-practical', oPAvg);
                
                // Update progress bars
                const theoreticalBar = document.getElementById('db-theoretical-bar');
                const practicalBar = document.getElementById('db-practical-bar');
                if (theoreticalBar && oTAvg > 0) {
                    theoreticalBar.style.width = `${(oTAvg / 10) * 100}%`;
                }
                if (practicalBar && oPAvg > 0) {
                    practicalBar.style.width = `${(oPAvg / 10) * 100}%`;
                }
                
                // Update timestamp
                const timestampEl = document.getElementById('kpi-last-update');
                if (timestampEl) {
                    timestampEl.textContent = `Atualizado às ${new Date().toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'})}`;
                }
                
                // Render students with pending replacements (clickable list)
                renderStudentsWithReplacements();
                
                renderCourseDistributionChart(cDist);
                renderModuleAverages(tAvgs, pAvgs);
            } catch (e) { console.error("[renderAtAGlance] Erro:", e); showError("Erro ao renderizar visão geral."); }
        }
        
        // Calculate today's shifts from escalas
        function calculateTodayShifts() {
            const today = appState.todayBR || '';
            if (!today) return '-';
            
            let totalShifts = 0;
            
            Object.values(appState.escalas || {}).forEach(escala => {
                if (!escala || !escala.headersDay || !escala.alunos) return;
                
                const hasToday = escala.headersDay.some(day => {
                    const normalizedDay = String(day || '').trim();
                    return normalizedDay === today;
                });
                
                if (hasToday) {
                    escala.alunos.forEach(aluno => {
                        if (!aluno) return;
                        const todayValue = aluno[today] || aluno[today.replace('/', '_')];
                        if (todayValue && !['off', 'folga', '-', ''].includes(String(todayValue).toLowerCase().trim())) {
                            totalShifts++;
                        }
                    });
                }
            });
            
            return totalShifts || '-';
        }
        
        // Update KPI semantic status (Normal, Alerta, Crítico)
        // Uses INCOR_KPI_THRESHOLDS constants for maintainability
        function updateKPISemanticStatus(cardId, value, secondaryValue) {
            const card = document.getElementById(cardId);
            if (!card) return;
            
            let status = 'normal';
            let statusText = 'Normal';
            
            switch(cardId) {
                case 'kpi-card-frequency':
                    // Frequency: check if active students ratio is good
                    const ratio = value > 0 ? (secondaryValue / value) : 1;
                    if (ratio < INCOR_KPI_THRESHOLDS.FREQUENCY_CRITICAL) {
                        status = 'critical';
                        statusText = 'Crítico';
                    } else if (ratio < INCOR_KPI_THRESHOLDS.FREQUENCY_ALERT) {
                        status = 'alert';
                        statusText = 'Alerta';
                    }
                    break;
                    
                case 'kpi-card-pending':
                    // Pending replacements
                    if (value >= INCOR_KPI_THRESHOLDS.PENDING_CRITICAL) {
                        status = 'critical';
                        statusText = 'Crítico';
                    } else if (value >= INCOR_KPI_THRESHOLDS.PENDING_ALERT) {
                        status = 'alert';
                        statusText = 'Alerta';
                    } else if (value === 0) {
                        statusText = 'Ótimo';
                    }
                    break;
                    
                case 'kpi-card-shifts':
                    // Shifts: if 0 and it's a weekday, that might be alert
                    if (value === 0 || value === '-') {
                        const today = new Date();
                        const dayOfWeek = today.getDay();
                        if (dayOfWeek > 0 && dayOfWeek < 6) {
                            status = 'alert';
                            statusText = 'Sem escala';
                        } else {
                            statusText = 'Fim de semana';
                        }
                    }
                    break;
                    
                case 'kpi-card-theoretical':
                case 'kpi-card-practical':
                    // Grades: use configured thresholds
                    if (value < INCOR_KPI_THRESHOLDS.GRADE_CRITICAL) {
                        status = 'critical';
                        statusText = 'Crítico';
                    } else if (value < INCOR_KPI_THRESHOLDS.GRADE_ALERT) {
                        status = 'alert';
                        statusText = 'Alerta';
                    } else if (value >= INCOR_KPI_THRESHOLDS.GRADE_EXCELLENT) {
                        statusText = 'Excelente';
                    } else {
                        statusText = 'Bom';
                    }
                    break;
            }
            
            card.setAttribute('data-status', status);
            
            // Update status badge text
            const statusBadge = card.querySelector('.incor-kpi-status-badge');
            if (statusBadge) {
                statusBadge.textContent = statusText;
            }
        }
        
        // Render clickable list of students with pending replacements
        function renderStudentsWithReplacements() {
            const container = document.getElementById('students-with-replacements-list');
            const countBadge = document.getElementById('pending-count-badge');
            if (!container) return;
            
            // Group pending replacements by student
            const pendingByStudent = {};
            appState.ausenciasReposicoes.forEach(f => {
                if (f && !f.DataReposicaoISO && (f.EmailHC || f.NomeCompleto)) {
                    const email = f.EmailHC || '';
                    const nome = f.NomeCompleto || 'Aluno';
                    const key = email || nome;
                    if (!pendingByStudent[key]) {
                        pendingByStudent[key] = { email, nome, count: 0 };
                    }
                    pendingByStudent[key].count++;
                }
            });
            
            const studentsArray = Object.values(pendingByStudent).sort((a, b) => b.count - a.count);
            
            // Update count badge
            if (countBadge) {
                countBadge.textContent = studentsArray.length;
            }
            
            if (studentsArray.length === 0) {
                container.innerHTML = '<div class="incor-pending__empty">Nenhuma reposição pendente</div>';
                return;
            }
            
            // Store ALL student data for click handling (no limit now)
            window._pendingStudentsData = studentsArray;
            
            let html = '';
            studentsArray.forEach((student, index) => {
                const escapedName = escapeHtml(student.nome);
                
                html += `
                    <div class="incor-pending__item" data-student-index="${index}">
                        <span class="incor-pending__name" title="${escapedName}">${escapedName}</span>
                        <span class="incor-pending__count">${student.count}</span>
                    </div>
                `;
            });
            
            container.innerHTML = html;
            
            // Add click event listeners
            container.querySelectorAll('.incor-pending__item[data-student-index]').forEach(link => {
                link.addEventListener('click', function() {
                    const index = parseInt(this.getAttribute('data-student-index'), 10);
                    const student = window._pendingStudentsData[index];
                    if (student) {
                        handleStudentReplacementClick(student.email, student.nome);
                    }
                });
            });
        }
        
        // Handle click on student with replacement - navigate to their absences tab
        function handleStudentReplacementClick(email, nome) {
            console.log(`[handleStudentReplacementClick] Navegando para faltas do aluno: ${email || nome}`);
            
            // Try to find the student by email first, then by name
            let studentEmail = email;
            if (!studentEmail && nome) {
                const nomeNormalizado = normalizeString(nome);
                for (const [e, info] of appState.alunosMap) {
                    if (normalizeString(info.NomeCompleto) === nomeNormalizado) {
                        studentEmail = e;
                        break;
                    }
                }
            }
            
            if (studentEmail && appState.alunosMap.has(studentEmail)) {
                showStudentDetail(studentEmail);
                // Switch to faltas (absences) tab after a short delay to ensure view is rendered
                setTimeout(() => {
                    switchStudentTab('faltas');
                }, 100);
            } else {
                showError(`Aluno não encontrado: ${nome || email}`);
            }
        };
        
        function renderCourseDistributionChart(distribution) {
            const c = document.getElementById('course-distribution-chart');
            if (!c) return;
            
            if (!distribution || distribution.length === 0) {
                c.innerHTML = '<p class="incor-pending__empty">Sem dados de distribuição por curso.</p>';
                return;
            }
            
            const maxCount = Math.max(...distribution.map(d => d.count));
            
            const MAX_DISTRIBUTION_COLORS = 6;
            let html = '';
            distribution.forEach((item, i) => {
                const barWidth = maxCount > 0 ? (item.count / maxCount) * 100 : 0;
                const colorNum = (i % MAX_DISTRIBUTION_COLORS) + 1;
                
                html += `
                    <div class="incor-dist">
                        <span class="incor-dist__label" title="${escapeHtml(item.course)}">${escapeHtml(item.course)}</span>
                        <div class="incor-dist__bar">
                            <div class="incor-dist__fill incor-dist__fill--${colorNum}" style="width: ${barWidth}%;"></div>
                        </div>
                        <span class="incor-dist__count">${escapeHtml(String(item.count))}</span>
                    </div>
                `;
            });
            
            c.innerHTML = html;
        }
        
        function renderModuleAverages(tAvgs, pAvgs) {
            const container = document.getElementById('module-averages-chart');
            if (!container) return;
            
            // Get counts for each module to show student count
            const tCounts = {};
            const pCounts = {};
            // Map to track canonical key names for counts (normalized -> key used in tAvgs)
            const canonicalCountKeyMap = new Map();
            
            // Build a reverse lookup from tAvgs keys to their normalized form
            Object.keys(tAvgs).forEach(k => {
                const kNormalized = normalizeKeyForDeduplication(k);
                canonicalCountKeyMap.set(kNormalized, k);
            });
            
            // Process theoretical data to get counts - matching the canonical keys from tAvgs
            if (appState.notasTeoricas?.registros) {
                appState.notasTeoricas.registros.forEach(r => {
                    // Track processed keys for this record to avoid counting variants
                    const processedKeysForRecord = new Set();
                    
                    Object.keys(r).forEach(k => {
                        const kUpper = k.toUpperCase();
                        if (!EXCLUDED_FIELDS_SET.has(kUpper) && k.trim() !== '') {
                            const n = parseNota(r[k]);
                            if (n > 0) {
                                // Normalize key to match canonical key
                                const kNormalized = normalizeKeyForDeduplication(k);
                                
                                // Skip if we've already processed a variant of this key for this record
                                if (processedKeysForRecord.has(kNormalized)) {
                                    return;
                                }
                                processedKeysForRecord.add(kNormalized);
                                
                                // Use the canonical key from tAvgs if available
                                const canonicalKey = canonicalCountKeyMap.get(kNormalized) || k;
                                tCounts[canonicalKey] = (tCounts[canonicalKey] || 0) + 1;
                            }
                        }
                    });
                });
            }
            
            // Process practical data to get counts
            if (appState.notasPraticas && typeof appState.notasPraticas === 'object') {
                Object.values(appState.notasPraticas).forEach(p => {
                    const pNome = p.nomePratica;
                    if (p && p.registros) {
                        pCounts[pNome] = p.registros.length;
                    }
                });
            }
            
            // Helper to extract module number from key for sorting
            const extractModuleNumber = (key) => {
                const match = key.match(/\d+/);
                return match ? parseInt(match[0], 10) : 999;
            };
            
            // Helper to normalize key for comparison
            const normalizeKey = (key) => {
                return key.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
            };
            
            // Separate MÉDIA entries from individual discipline entries
            const mediaEntries = Object.entries(tAvgs)
                .filter(([key, value]) => {
                    const keyNorm = normalizeKey(key);
                    return (keyNorm.includes('MEDIA') || keyNorm.includes('MÉDIA')) && value > 0;
                })
                .map(([key, value]) => ({ key, value, sortNum: extractModuleNumber(key) }))
                .sort((a, b) => a.sortNum - b.sortNum);
            
            const disciplineEntries = Object.entries(tAvgs)
                .filter(([key, value]) => {
                    const keyNorm = normalizeKey(key);
                    return !(keyNorm.includes('MEDIA') || keyNorm.includes('MÉDIA')) && value > 0;
                })
                .map(([key, value]) => ({ key, value }))
                .sort((a, b) => a.key.localeCompare(b.key));
            
            // Filter and sort practical averages
            const practicalEntries = Object.entries(pAvgs)
                .filter(([_, value]) => value > 0)
                .map(([key, value]) => ({ key, value, sortNum: extractModuleNumber(key) }))
                .sort((a, b) => {
                    if (a.sortNum !== b.sortNum) return a.sortNum - b.sortNum;
                    return a.key.localeCompare(b.key);
                });
            
            // Calculate statistics
            const avgTheoretical = mediaEntries.length > 0 
                ? (mediaEntries.reduce((sum, e) => sum + e.value, 0) / mediaEntries.length).toFixed(1)
                : (disciplineEntries.length > 0 
                    ? (disciplineEntries.reduce((sum, e) => sum + e.value, 0) / disciplineEntries.length).toFixed(1)
                    : 'N/A');
            const avgPractical = practicalEntries.length > 0 
                ? (practicalEntries.reduce((sum, e) => sum + e.value, 0) / practicalEntries.length).toFixed(1)
                : 'N/A';
            
            // Combine theoretical entries
            const theoreticalEntries = mediaEntries.map(({ key, value }) => [key, value]);
            const allTheoreticalEntries = theoreticalEntries.length > 0 ? theoreticalEntries : disciplineEntries.map(({ key, value }) => [key, value]);
            
            // Build theoretical content HTML (card grid layout)
            const buildTheoricalContent = () => {
                if (allTheoreticalEntries.length === 0) {
                    return `
                        <div class="incor-modules-empty-state">
                            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
                            </svg>
                            <p>Nenhuma nota teórica disponível</p>
                            <span>Os dados serão carregados automaticamente quando disponíveis</span>
                        </div>
                    `;
                }
                
                return `
                    <div class="incor-modules-stats-bar">
                        <div class="incor-modules-stat">
                            <span class="incor-modules-stat-value">${allTheoreticalEntries.length}</span>
                            <span class="incor-modules-stat-label">Módulo${allTheoreticalEntries.length > 1 ? 's' : ''}</span>
                        </div>
                        <div class="incor-modules-stat incor-modules-stat--highlight">
                            <span class="incor-modules-stat-value">${avgTheoretical}</span>
                            <span class="incor-modules-stat-label">Média Geral</span>
                        </div>
                    </div>
                    <div class="incor-modules-card-grid">
                        ${allTheoreticalEntries.map(([key, value], index) => {
                            const percentage = (value / 10) * 100;
                            const count = tCounts[key] || 0;
                            const gradeClass = value >= 7 ? 'good' : value >= 5 ? 'warning' : 'danger';
                            return `
                                <div class="incor-module-grid-card incor-module-grid-card--theoretical">
                                    <div class="incor-module-grid-card__header">
                                        <span class="incor-module-grid-card__badge">Teórica ${index + 1}</span>
                                        ${count > 0 ? `<span class="incor-module-grid-card__count">${count} aluno${count > 1 ? 's' : ''}</span>` : ''}
                                    </div>
                                    <h4 class="incor-module-grid-card__title" title="${escapeHtml(key)}">${escapeHtml(key)}</h4>
                                    <div class="incor-module-grid-card__grade incor-module-grid-card__grade--${gradeClass}">
                                        <span class="incor-module-grid-card__value">${value.toFixed(1)}</span>
                                        <span class="incor-module-grid-card__max">/10</span>
                                    </div>
                                    <div class="incor-module-grid-card__progress">
                                        <div class="incor-module-grid-card__progress-fill incor-module-grid-card__progress-fill--theoretical" style="width: ${percentage}%;"></div>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                `;
            };
            
            // Build practical content HTML (card grid layout)
            const buildPracticalContent = () => {
                if (practicalEntries.length === 0) {
                    return `
                        <div class="incor-modules-empty-state">
                            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/>
                            </svg>
                            <p>Nenhuma nota prática disponível</p>
                            <span>Os dados serão carregados automaticamente quando disponíveis</span>
                        </div>
                    `;
                }
                
                return `
                    <div class="incor-modules-stats-bar">
                        <div class="incor-modules-stat">
                            <span class="incor-modules-stat-value">${practicalEntries.length}</span>
                            <span class="incor-modules-stat-label">Módulo${practicalEntries.length > 1 ? 's' : ''}</span>
                        </div>
                        <div class="incor-modules-stat incor-modules-stat--highlight">
                            <span class="incor-modules-stat-value">${avgPractical}</span>
                            <span class="incor-modules-stat-label">Média Geral</span>
                        </div>
                    </div>
                    <div class="incor-modules-card-grid">
                        ${practicalEntries.map(({ key, value }, index) => {
                            const percentage = (value / 10) * 100;
                            const count = pCounts[key] || 0;
                            const gradeClass = value >= 7 ? 'good' : value >= 5 ? 'warning' : 'danger';
                            return `
                                <div class="incor-module-grid-card incor-module-grid-card--practical">
                                    <div class="incor-module-grid-card__header">
                                        <span class="incor-module-grid-card__badge incor-module-grid-card__badge--practical">Prática ${index + 1}</span>
                                        ${count > 0 ? `<span class="incor-module-grid-card__count">${count} avaliação${count > 1 ? 'ões' : ''}</span>` : ''}
                                    </div>
                                    <h4 class="incor-module-grid-card__title" title="${escapeHtml(key)}">${escapeHtml(key)}</h4>
                                    <div class="incor-module-grid-card__grade incor-module-grid-card__grade--${gradeClass}">
                                        <span class="incor-module-grid-card__value">${value.toFixed(1)}</span>
                                        <span class="incor-module-grid-card__max">/10</span>
                                    </div>
                                    <div class="incor-module-grid-card__progress">
                                        <div class="incor-module-grid-card__progress-fill incor-module-grid-card__progress-fill--practical" style="width: ${percentage}%;"></div>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                `;
            };
            
            // Render content with tab panels
            container.innerHTML = `
                <div id="modules-content-teoria" class="incor-modules-tab-content incor-modules-tab-content--active">
                    ${buildTheoricalContent()}
                </div>
                <div id="modules-content-pratica" class="incor-modules-tab-content">
                    ${buildPracticalContent()}
                </div>
            `;
            
            // Setup tab switching
            setupModuleTabSwitching();
        }
        
        /**
         * Setup tab switching for module averages section
         */
        function setupModuleTabSwitching() {
            const tabTeoria = document.getElementById('tab-teoria');
            const tabPratica = document.getElementById('tab-pratica');
            const contentTeoria = document.getElementById('modules-content-teoria');
            const contentPratica = document.getElementById('modules-content-pratica');
            
            if (!tabTeoria || !tabPratica || !contentTeoria || !contentPratica) return;
            
            const switchTab = (activeTab) => {
                // Update tab buttons
                tabTeoria.classList.toggle('incor-modules-tab--active', activeTab === 'teoria');
                tabPratica.classList.toggle('incor-modules-tab--active', activeTab === 'pratica');
                
                // Update content visibility
                contentTeoria.classList.toggle('incor-modules-tab-content--active', activeTab === 'teoria');
                contentPratica.classList.toggle('incor-modules-tab-content--active', activeTab === 'pratica');
            };
            
            tabTeoria.addEventListener('click', () => switchTab('teoria'));
            tabPratica.addEventListener('click', () => switchTab('pratica'));
        }

        function renderRecentAbsences() {
             try {
                 const tbody = document.getElementById('recent-absences-list');
                 const emptyState = document.getElementById('incor-action-empty');
                 
                 if (!tbody) return;
                 
                 if (!appState.ausenciasReposicoes || appState.ausenciasReposicoes.length === 0) {
                     tbody.innerHTML = '';
                     if (emptyState) emptyState.hidden = false;
                     return;
                 }
                 
                 if (emptyState) emptyState.hidden = true;
                 
                 const sorted = [...appState.ausenciasReposicoes]
                     .filter(f => f.EmailHC || f.NomeCompleto) 
                     .sort((a, b) => {
                         const dA = a.DataReposicaoISO || a.DataAusenciaISO; 
                         const dB = b.DataReposicaoISO || b.DataAusenciaISO; 
                         if (!dB) return -1; 
                         if (!dA) return 1; 
                         return new Date(dB + 'T00:00:00') - new Date(dA + 'T00:00:00');
                     }); 
                
                 tbody.innerHTML = sorted.slice(0, MAX_RECENT_ACTIVITIES).map((item, index) => {
                     const aluno = appState.alunos.find(a => 
                         (item.EmailHC && normalizeString(a.EmailHC) === normalizeString(item.EmailHC)) ||
                         (item.NomeCompleto && normalizeString(a.NomeCompleto) === normalizeString(item.NomeCompleto))
                     );
                     const nome = aluno ? aluno.NomeCompleto : (item.NomeCompleto || item.EmailHC);
                     const initials = getInitials(nome);
                     const isPending = !item.DataReposicaoISO;
                     const dateValue = item.DataReposicaoISO || item.DataAusenciaISO;
                     const formattedDate = dateValue ? new Date(dateValue + 'T00:00:00').toLocaleDateString('pt-BR') : '--/--';
                     const local = item.Local || 'N/A';
                     
                     const statusClass = isPending ? 'incor-action-status--pending' : 'incor-action-status--completed';
                     const statusText = isPending ? 'Pendente' : 'Concluída';
                     const typeClass = isPending ? 'incor-action-type--absence' : 'incor-action-type--makeup';
                     const typeText = isPending ? 'Ausência' : 'Reposição';
                     
                     return `<tr data-email="${escapeHtml(item.EmailHC || '')}" data-index="${index}" data-status="${isPending ? 'pending' : 'completed'}">
                         <td>
                             <span class="incor-action-status ${statusClass}">${statusText}</span>
                         </td>
                         <td>
                             <div class="incor-action-name">
                                 <div class="incor-action-avatar">${escapeHtml(initials)}</div>
                                 <span class="incor-action-name-text" title="${escapeHtml(nome)}">${escapeHtml(nome)}</span>
                             </div>
                         </td>
                         <td>
                             <span class="incor-action-type ${typeClass}">${typeText}</span>
                         </td>
                         <td class="incor-action-local">${escapeHtml(local)}</td>
                         <td class="incor-action-date">${formattedDate}</td>
                         <td>
                             <div class="incor-action-buttons">
                                 <button class="incor-action-btn incor-action-btn--view" title="Visualizar aluno" data-action="view">
                                     <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                         <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                                         <path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                                     </svg>
                                 </button>
                                 ${isPending ? `
                                     <button class="incor-action-btn incor-action-btn--approve" title="Aprovar reposição" data-action="approve">
                                         <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                             <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                                         </svg>
                                     </button>
                                     <button class="incor-action-btn incor-action-btn--notify" title="Enviar notificação" data-action="notify">
                                         <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                             <path stroke-linecap="round" stroke-linejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
                                         </svg>
                                     </button>
                                 ` : ''}
                             </div>
                         </td>
                     </tr>`;
                 }).join('');
                 
                 // Add click listeners to action buttons
                 tbody.querySelectorAll('.incor-action-btn').forEach(btn => {
                     btn.addEventListener('click', function(e) {
                         e.stopPropagation();
                         const row = this.closest('tr');
                         const email = row.getAttribute('data-email');
                         const action = this.getAttribute('data-action');
                         
                         if (action === 'view' && email) {
                             if (appState.alunosMap.has(email)) {
                                 showStudentDetail(email);
                                 setTimeout(() => switchStudentTab('faltas'), 100);
                             }
                         } else if (action === 'approve') {
                             console.log('[incor-action] Aprovar ação para:', email);
                             // Future: implement approval workflow
                         } else if (action === 'notify') {
                             console.log('[incor-action] Notificar ação para:', email);
                             // Future: implement notification workflow
                         }
                     });
                 });
                 
             } catch(e) { 
                 console.error("[renderRecentAbsences] Erro:", e); 
                 showError("Erro ao renderizar registros recentes."); 
             }
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
                    
                    // Extract the value for this specific date from the aluno's escala
                    // The date column (e.g., "15/11") contains the schedule info like "08h às 13h" or "Folga"
                    const dateValue = aluno[target] || '';
                    
                    rosterMap.set(key, {
                        ...aluno,
                        __escalaNome: escala.nomeEscala || escala.nome || '',
                        __headers: headers,
                        __dateValue: dateValue // Store the schedule value for this date
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

                // Parse scheduled time from the date value in escala
                const dateValue = entry.__dateValue || '';
                let scheduledEntrada = null;
                let scheduledSaida = null;
                const isRestDay = isRestDayValue(dateValue);
                
                if (!isRestDay) {
                    // Try to extract scheduled time (e.g., "08h às 13h")
                    const timeInfo = parseTimeFromScheduleValue(dateValue);
                    if (timeInfo) {
                        scheduledEntrada = timeInfo.horaEntrada;
                        scheduledSaida = timeInfo.horaSaida;
                    }
                }

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
                    
                    // Add scheduled time and rest day info to the record
                    if (isRestDay) {
                        record.isRestDay = true;
                    }
                    if (scheduledEntrada) {
                        record.scheduledEntrada = scheduledEntrada;
                        record.scheduledEntradaMinutes = toMinutes(scheduledEntrada);
                    }
                    if (scheduledSaida) {
                        record.scheduledSaida = scheduledSaida;
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
            
            // Merge roster and actual ponto records, preserving scheduled times from roster
            let combined;
            if (normalizedRecords.length) {
                // Create a map of roster records to get scheduled times
                const rosterMap = new Map();
                normalizedRecords.forEach(record => {
                    const key = getPontoRecordKey(record);
                    rosterMap.set(key, record);
                });
                
                // Merge with base records, adding scheduled time info
                const mergedMap = new Map();
                
                // First add all roster records
                normalizedRecords.forEach(record => {
                    mergedMap.set(getPontoRecordKey(record), record);
                });
                
                // Then overlay actual ponto records, but preserve scheduled times
                baseRecords.forEach(record => {
                    const key = getPontoRecordKey(record);
                    const rosterRecord = rosterMap.get(key);
                    
                    // If we have a roster record with scheduled times, merge them
                    if (rosterRecord) {
                        mergedMap.set(key, {
                            ...record,
                            scheduledEntrada: rosterRecord.scheduledEntrada || record.scheduledEntrada,
                            scheduledEntradaMinutes: rosterRecord.scheduledEntradaMinutes || record.scheduledEntradaMinutes,
                            scheduledSaida: rosterRecord.scheduledSaida || record.scheduledSaida,
                            isRestDay: rosterRecord.isRestDay || record.isRestDay
                        });
                    } else {
                        mergedMap.set(key, record);
                    }
                });
                
                combined = Array.from(mergedMap.values());
            } else {
                combined = baseRecords.slice();
            }
            
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

        // Legacy helper functions removed (parseAvailableDates, parseAvailableScales, parseLastUpdated, resolvePontoRecords)
        // These were only used by the removed extractPontoPayload() and applyPontoData() functions
        // Legacy extractPontoPayload() removed - no longer needed with Firebase-only approach

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
            
            // Preserve scheduled time information if present
            const scheduledEntrada = row._scheduledEntrada || null;
            const scheduledSaida = row._scheduledSaida || null;
            const isRestDay = row._isRestDay || false;

            const normalized = {
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
            
            // Add scheduled time fields if available
            if (scheduledEntrada) {
                normalized.scheduledEntrada = scheduledEntrada;
                normalized.scheduledEntradaMinutes = toMinutes(scheduledEntrada);
            }
            if (scheduledSaida) {
                normalized.scheduledSaida = scheduledSaida;
            }
            if (isRestDay) {
                normalized.isRestDay = true;
            }
            
            return normalized;
        }

        // Legacy applyPontoData() removed - data organization now handled by Firebase listeners
        // Data is processed via extractAndPopulatePontoDates() when loaded from Firebase

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
                    dateInput.disabled = false;
                } else {
                    // No dates available - disable the input
                    dateInput.disabled = true;
                    console.log('[hydratePontoSelectors] Nenhuma data disponível no ponto');
                }
                if (pontoState.selectedDate) {
                    dateInput.value = pontoState.selectedDate;
                }
            }

            if (datalist) {
                if (pontoState.dates.length > 0) {
                    datalist.innerHTML = pontoState.dates
                        .slice()
                        .sort((a, b) => b.localeCompare(a))
                        .map((date) => `<option value="${date}">${formatDateBR(date)}</option>`)
                        .join('');
                } else {
                    datalist.innerHTML = '';
                }
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
            
            if (availableScales.length > 0) {
                availableScales.forEach((scaleName) => {
                    const safe = escapeHtml(scaleName);
                    options += `<option value="${safe}">${safe}</option>`;
                });
                select.disabled = false;
            } else {
                // No scales available for selected date
                select.disabled = false; // Keep enabled but show "all" only
                console.log('[updatePontoScaleOptions] Nenhuma escala específica para a data:', pontoState.selectedDate);
            }

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

        function updateDateNavigationButtons() {
            const prevButton = document.getElementById('ponto-prev-date');
            const nextButton = document.getElementById('ponto-next-date');
            
            if (!prevButton || !nextButton) return;
            
            if (!pontoState.dates || pontoState.dates.length === 0) {
                // No dates available - disable both buttons
                prevButton.disabled = true;
                nextButton.disabled = true;
                return;
            }
            
            const currentIndex = pontoState.dates.indexOf(pontoState.selectedDate);
            
            if (currentIndex === -1) {
                // Selected date not in list - disable both buttons
                prevButton.disabled = true;
                nextButton.disabled = true;
                console.log('[updateDateNavigationButtons] Data selecionada não encontrada na lista:', pontoState.selectedDate);
                return;
            }
            
            // Prev button should be disabled if we're at the last date (oldest)
            prevButton.disabled = currentIndex >= pontoState.dates.length - 1;
            
            // Next button should be disabled if we're at the first date (newest)
            nextButton.disabled = currentIndex <= 0;
        }

        function enrichPontoRows(rows = []) {
            // Build a map of scheduled times per student (from roster/escala data)
            // These are the expected times based on their schedule
            const scheduledTimesMap = new Map();
            rows.forEach((row) => {
                if (row.scheduledEntradaMinutes !== undefined && row.scheduledEntradaMinutes !== null) {
                    const key = row.id || row.nomeId;
                    if (key) {
                        scheduledTimesMap.set(key, row.scheduledEntradaMinutes);
                    }
                }
            });

            return rows.map((row) => {
                let status = 'absent';
                let statusLabel = 'Falta';
                let badgeClass = 'badge badge-red';
                let delayMinutes = null;

                // Check if this is a scheduled rest day
                if (row.isRestDay) {
                    status = 'off';
                    statusLabel = 'Folga';
                    badgeClass = 'badge badge-gray';
                    
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
                }

                // If student has actual arrival time
                if (Number.isFinite(row.horaEntradaMinutes)) {
                    // Get the scheduled time for this student
                    const key = row.id || row.nomeId;
                    const scheduledTime = key ? scheduledTimesMap.get(key) : null;
                    
                    // If we have a scheduled time, compare against it
                    // Otherwise, student is present (no delay calculation possible)
                    if (scheduledTime != null && Number.isFinite(scheduledTime)) {
                        const diff = Math.max(0, row.horaEntradaMinutes - scheduledTime);
                        delayMinutes = diff;
                        
                        if (diff > ATRASO_THRESHOLD_MINUTES) {
                            status = 'late';
                            statusLabel = `Atraso (+${diff} min)`;
                            badgeClass = 'badge badge-yellow';
                        } else {
                            status = 'present';
                            statusLabel = 'Presente';
                            badgeClass = 'badge badge-green';
                        }
                    } else {
                        // No scheduled time available - mark as present without delay calculation
                        // This happens when: 1) Student not in roster for this date, or 
                        // 2) Escala data doesn't have time info, or 3) Legacy ponto data
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
                const offCount = enriched.filter((row) => row.status === 'off').length;
                // Total escalados should not include people on rest days
                const totalEscalados = Math.max(
                    Math.max(0, (dataset.rosterSize || 0) - offCount), 
                    Math.max(0, (enriched.length - offCount) || 0), 
                    Math.max(0, TOTAL_ESCALADOS - offCount)
                );

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
                        if (pontoState.selectedDate) {
                            message.innerHTML = `
                                <strong>Nenhum registro encontrado para ${formatDateBR(pontoState.selectedDate)}.</strong><br>
                                <span style="font-size: 0.9em; color: var(--text-secondary);">
                                    Dica: Use os botões de navegação ou selecione outra data.
                                </span>
                            `;
                        } else {
                            message.innerHTML = `
                                <strong>Nenhum registro de ponto disponível.</strong><br>
                                <span style="font-size: 0.9em; color: var(--text-secondary);">
                                    Execute o Google Apps Script para enviar dados para o Firebase.
                                </span>
                            `;
                        }
                    } else if (enrichedCount === 0) {
                        message.innerHTML = `
                            <strong>Nenhum registro disponível para a escala selecionada.</strong><br>
                            <span style="font-size: 0.9em; color: var(--text-secondary);">
                                Tente selecionar "Todas as escalas" no filtro acima.
                            </span>
                        `;
                    } else {
                        message.innerHTML = `
                            <strong>Nenhum registro encontrado para os filtros selecionados.</strong><br>
                            <span style="font-size: 0.9em; color: var(--text-secondary);">
                                Limpe os filtros ou tente outra busca.
                            </span>
                        `;
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
                const timeStr = pontoState.lastLoadedAt
                    ? `Atualizado ${pontoState.lastLoadedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
                    : 'Dados não carregados';
                const dateCount = pontoState.dates && pontoState.dates.length > 0
                    ? ` • ${pontoState.dates.length} ${pontoState.dates.length === 1 ? 'data disponível' : 'datas disponíveis'}`
                    : '';
                syncLabel.textContent = timeStr + dateCount;
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

        function handlePontoPrevDate() {
            if (!pontoState.dates || pontoState.dates.length === 0) return;
            const currentIndex = pontoState.dates.indexOf(pontoState.selectedDate);
            if (currentIndex < pontoState.dates.length - 1) {
                const prevDate = pontoState.dates[currentIndex + 1];
                pontoState.selectedDate = prevDate;
                hydratePontoSelectors();
                refreshPontoView();
            }
        }

        function handlePontoNextDate() {
            if (!pontoState.dates || pontoState.dates.length === 0) return;
            const currentIndex = pontoState.dates.indexOf(pontoState.selectedDate);
            if (currentIndex > 0) {
                const nextDate = pontoState.dates[currentIndex - 1];
                pontoState.selectedDate = nextDate;
                hydratePontoSelectors();
                refreshPontoView();
            }
        }

        // Legacy loadPontoData() removed - Ponto data now comes from Firebase Realtime Database
        // Data is already loaded and cached via setupDatabaseListeners() and extractAndPopulatePontoDates()

        async function ensurePontoData(date, scale = 'all', { showInlineSpinner = false, useTodayEndpoint = false, adoptSelection = false, forceReload = false, replaceExisting = false } = {}) {
            const isoDate = normalizeDateInput(date);
            const scaleLabel = scale || 'all';
            
            // If forceReload is requested, clear the cache
            // This allows the data to be re-filtered from the Firebase-loaded data
            if (forceReload && isoDate) {
                if (scaleLabel === 'all') {
                    pontoState.cache.delete(makePontoCacheKey(isoDate, 'all'));
                } else {
                    pontoState.cache.delete(makePontoCacheKey(isoDate, scaleLabel));
                }
            }
            
            // Check if data exists in Firebase-loaded state
            if (isoDate && pontoState.byDate.has(isoDate)) {
                // Data exists from Firebase, just need to ensure it's cached for the requested scale
                getPontoRecords(isoDate, scaleLabel); // This will cache it
                return { success: true, cached: false, selectedDate: isoDate, selectedScale: scaleLabel };
            }
            
            // Data not available yet - might still be loading from Firebase
            // Return a success response with available dates
            const availableDate = pontoState.dates.length > 0 ? pontoState.dates[0] : isoDate;
            console.log(`[ensurePontoData] Data para ${isoDate} não disponível. Usando data disponível: ${availableDate}`);
            return { success: true, selectedDate: availableDate, selectedScale: scaleLabel };
        }

        async function initializePontoPanel() {
            console.log('[initializePontoPanel] Inicializando painel de ponto...');
            
            const loadingState = document.getElementById('ponto-loading-state');
            const emptyState = document.getElementById('ponto-empty-state');
            
            // Show loading initially
            if (loadingState) {
                loadingState.hidden = false;
                loadingState.textContent = 'Carregando registros do ponto...';
            }
            if (emptyState) {
                emptyState.hidden = true;
            }
            
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
            
            // Update last loaded time
            pontoState.lastLoadedAt = new Date();
            
            // Hide loading state
            if (loadingState) {
                loadingState.hidden = true;
            }
            
            hydratePontoSelectors();
            refreshPontoView();
            
            console.log('[initializePontoPanel] Painel inicializado:', {
                selectedDate: pontoState.selectedDate,
                selectedScale: pontoState.selectedScale,
                totalDates: pontoState.dates.length,
                totalRecords: pontoState.byDate.size
            });
        }

        function renderStudentList(students) {
             try {
                 const panel = document.getElementById('student-list-panel'); 
                 if (!panel) return;
                 
                 if (!students || students.length === 0) { 
                     panel.innerHTML = `
                         <div class="content-card p-8 text-center">
                             <svg class="mx-auto h-12 w-12 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                 <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                             </svg>
                             <h3 class="mt-2 text-sm font-medium text-slate-900">Nenhum aluno encontrado</h3>
                             <p class="mt-1 text-sm text-slate-500">
                                 Os dados de alunos não foram carregados do Firebase.
                             </p>
                             <div class="mt-6 text-xs text-slate-600 text-left bg-slate-50 p-4 rounded-lg">
                                 <p class="font-semibold mb-2">Possíveis soluções:</p>
                                 <ol class="list-decimal list-inside space-y-1">
                                     <li>Execute o Google Apps Script para enviar dados para o Firebase</li>
                                     <li>Verifique se há dados em <code class="bg-white px-1 py-0.5 rounded">/exportAll/Alunos/dados</code> no Firebase Console</li>
                                     <li>Verifique as regras do Firebase Realtime Database</li>
                                     <li>Abra o console do navegador (F12) para ver mensagens de erro</li>
                                 </ol>
                             </div>
                         </div>
                     `; 
                     return; 
                 } 
                 
                 // Use DocumentFragment for better performance
                 const fragment = document.createDocumentFragment();
                 
                 const grouped = students.reduce((acc, s) => { const c = s.Curso || 'Sem Curso'; if (!acc[c]) acc[c] = []; acc[c].push(s); return acc; }, {}); 
                 const courses = Object.keys(grouped).sort((a, b) => a.localeCompare(b));
                 
                 // Pre-sort students once per group
                 courses.forEach(c => {
                     grouped[c].sort((a, b) => a.NomeCompleto.localeCompare(b.NomeCompleto));
                 });
                 
                 // Placeholder image URL - defined once
                 const placeholderImg = 'https://placehold.co/60x60/e2e8f0/64748b?text=?';
                 
                 courses.forEach(c => { 
                     const groupDiv = document.createElement('div');
                     groupDiv.className = 'student-group';
                     groupDiv.setAttribute('data-course', c);
                     
                     const header = document.createElement('h3');
                     header.className = 'student-group-header';
                     header.textContent = `${c} (${grouped[c].length})`;
                     groupDiv.appendChild(header);
                     
                     const grid = document.createElement('div');
                     grid.className = 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 p-1';
                     
                     grouped[c].forEach(s => { 
                         const card = document.createElement('div');
                         const inactive = s.Status !== 'Ativo';
                         card.className = `student-card${inactive ? ' inactive-card' : ''}`;
                         card.setAttribute('data-student-email', s.EmailHC || '');
                         card.setAttribute('data-student-name', normalizeString(s.NomeCompleto));
                         
                         // Build card content more efficiently
                         let cardHTML = '';
                         if (inactive) {
                             cardHTML += '<span class="badge badge-red inactive-badge">Inativo</span>';
                         }
                         
                         // Use loading="lazy" for images to improve initial load
                         const imgSrc = s.FotoID ? `https://lh3.googleusercontent.com/d/${s.FotoID}=s96-c` : placeholderImg;
                         cardHTML += `<img src="${imgSrc}" alt="Foto" loading="lazy" onerror="this.src='${placeholderImg}'">`;
                         cardHTML += `<p class="student-name">${s.NomeCompleto}</p>`;
                         cardHTML += `<p class="student-course mt-0.5">${s.Curso || 'Sem Curso'}</p>`;
                         
                         card.innerHTML = cardHTML;
                         grid.appendChild(card);
                     }); 
                     
                     groupDiv.appendChild(grid);
                     fragment.appendChild(groupDiv);
                 }); 
                 
                 // Clear and append in one operation
                 panel.innerHTML = '';
                 panel.appendChild(fragment);
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
                // Support both old (.tab-button) and new (.student-tab-button) button classes
                const button = e.target.closest('.tab-button, .student-tab-button');
                if(button){
                    const tab = button.getAttribute('data-tab'); 
                    switchStudentTab(tab);
                }
            });
        }
        
        function switchStudentTab(tabName) {
            console.log(`Trocando para aba de detalhe: ${tabName}`);
            // Support both old (.tab-button) and new (.student-tab-button) button classes
            document.querySelectorAll('#student-tabs-nav .tab-button, #student-tabs-nav .student-tab-button').forEach(btn => {
                btn.classList.toggle('active', btn.getAttribute('data-tab') === tabName);
            });
            // Support both old (.tab-content) and new (.student-tab-panel) content classes
            document.querySelectorAll('#student-tabs-content .tab-content, #student-tabs-content .student-tab-panel').forEach(content => {
                const isActive = content.id === `tab-${tabName}`;
                content.style.display = isActive ? 'block' : 'none';
                content.classList.toggle('active', isActive);
            });
        }

        function switchStudentSubTab(subTabId) {
            console.log(`[switchStudentSubTab] Trocando para sub-aba: ${subTabId}`);
            const subNavContainer = document.getElementById('student-detail-subnav-container') || document.querySelector('.np-tab-nav');
            const subContentContainer = document.getElementById('student-detail-subnav-content');
            
            if (subNavContainer) {
                // Suporta tanto .subnav-button (antigo) quanto .np-tab-button (novo)
                subNavContainer.querySelectorAll('.subnav-button, .np-tab-button').forEach(btn => {
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
                // CRITICAL FIX: Verify that student data has been loaded from Firebase
                // This prevents the app from getting stuck on a non-existent student page
                if (!appState.alunos || appState.alunos.length === 0) {
                    console.error('[showStudentDetail] Dados de alunos ainda não carregados. Aguarde...');
                    showError('Os dados ainda estão sendo carregados. Por favor, aguarde um momento e tente novamente.');
                    return;
                }
                
                const info = appState.alunosMap.get(email);
                if (!info) {
                    console.error(`[showStudentDetail] Aluno ${email} não encontrado no mapeamento.`);
                    showError(`Aluno ${email} não encontrado.`);
                    // Return to student list instead of staying on broken page
                    showView('dashboard-view');
                    switchMainTab('alunos');
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
             const p = document.getElementById('student-header');
             const studentInitial = encodeURIComponent(info.NomeCompleto?.charAt(0) || '?');
             const fallbackPhotoUrl = `https://placehold.co/120x120/0054B4/ffffff?text=${studentInitial}`;
             const photoUrl = info.FotoID 
                 ? `https://lh3.googleusercontent.com/d/${info.FotoID}=s200-c` 
                 : fallbackPhotoUrl;
             const statusClass = info.Status === 'Ativo' ? 'student-status-badge--active' : 'student-status-badge--inactive';
             
             p.innerHTML = `
                <img src="${photoUrl}" alt="Foto de ${info.NomeCompleto}" class="student-profile-avatar" onerror="this.src='${fallbackPhotoUrl}'">
                <div class="student-profile-info">
                    <h2 class="student-profile-name">${info.NomeCompleto || 'Nome não disponível'}</h2>
                    <p class="student-profile-course">${info.Curso || 'Curso não informado'}</p>
                    <div class="student-profile-status">
                        <span class="student-status-badge ${statusClass}">
                            ${info.Status || 'Indefinido'}
                        </span>
                    </div>
                </div>
             `;
        }

        function renderStudentDetailKPIs(faltas, notasP) {
             const tF=faltas.length; 
             const pF=faltas.filter(f=> f && !f.DataReposicaoISO).length; 
             let mP=0; let countP = 0; 
             if(notasP.length>0){
                 let s=0; 
                 notasP.forEach(n=>{
                     const k=Object.keys(n).find(k => 
                         /MÉDIA.*NOTA.*FINAL/i.test(k) || 
                         /MEDIA.*NOTA.*FINAL/i.test(k) ||
                         /MÉDIA.*FINAL/i.test(k) ||
                         /MEDIA.*FINAL/i.test(k) ||
                         /NOTA.*FINAL/i.test(k)
                     ) || null; 
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
             const p=document.getElementById('tab-info');
             
             // Format phone if available
             const formatPhone = (phone) => {
                 if (!phone) return 'N/A';
                 const cleaned = String(phone).replace(/\D/g, '');
                 if (cleaned.length === 11) {
                     return `(${cleaned.slice(0,2)}) ${cleaned.slice(2,7)}-${cleaned.slice(7)}`;
                 }
                 return phone;
             };
             
             p.innerHTML=`
                <!-- Personal Data Section -->
                <div class="student-info-section">
                    <h3 class="student-info-section-title">
                        <svg class="student-info-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        Dados Pessoais
                    </h3>
                    <dl class="student-info-grid">
                        <div class="student-info-item">
                            <dt class="student-info-label">Email Institucional</dt>
                            <dd class="student-info-value">${info.EmailHC||'N/A'}</dd>
                        </div>
                        <div class="student-info-item">
                            <dt class="student-info-label">Data de Nascimento</dt>
                            <dd class="student-info-value">${info.DataNascimento ? new Date(info.DataNascimento).toLocaleDateString('pt-BR', {timeZone: 'UTC'}) : 'N/A'}</dd>
                        </div>
                        <div class="student-info-item">
                            <dt class="student-info-label">Sexo</dt>
                            <dd class="student-info-value">${info.Sexo||'N/A'}</dd>
                        </div>
                        <div class="student-info-item">
                            <dt class="student-info-label">Estado Civil</dt>
                            <dd class="student-info-value">${info.EstadoCivil||'N/A'}</dd>
                        </div>
                    </dl>
                </div>
                
                <!-- Academic Data Section -->
                <div class="student-info-section">
                    <h3 class="student-info-section-title">
                        <svg class="student-info-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                        </svg>
                        Dados Acadêmicos
                    </h3>
                    <dl class="student-info-grid">
                        <div class="student-info-item student-info-item--highlight">
                            <dt class="student-info-label">Curso</dt>
                            <dd class="student-info-value">${info.Curso||'N/A'}</dd>
                        </div>
                        <div class="student-info-item">
                            <dt class="student-info-label">CREFITO</dt>
                            <dd class="student-info-value">${info.Crefito||'N/A'}</dd>
                        </div>
                        <div class="student-info-item">
                            <dt class="student-info-label">Status</dt>
                            <dd class="student-info-value">
                                <span class="info-status-badge ${info.Status === 'Ativo' ? 'info-status-badge--active' : 'info-status-badge--inactive'}">
                                    ${info.Status || 'Indefinido'}
                                </span>
                            </dd>
                        </div>
                    </dl>
                </div>
                
                <!-- Contact Section (if available) -->
                ${info.Telefone || info.Celular || info.EmailPessoal ? `
                <div class="student-info-section">
                    <h3 class="student-info-section-title">
                        <svg class="student-info-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                        Contato
                    </h3>
                    <dl class="student-info-grid">
                        ${info.Telefone ? `
                        <div class="student-info-item">
                            <dt class="student-info-label">Telefone</dt>
                            <dd class="student-info-value">${formatPhone(info.Telefone)}</dd>
                        </div>
                        ` : ''}
                        ${info.Celular ? `
                        <div class="student-info-item">
                            <dt class="student-info-label">Celular</dt>
                            <dd class="student-info-value">${formatPhone(info.Celular)}</dd>
                        </div>
                        ` : ''}
                        ${info.EmailPessoal ? `
                        <div class="student-info-item">
                            <dt class="student-info-label">Email Pessoal</dt>
                            <dd class="student-info-value">${info.EmailPessoal}</dd>
                        </div>
                        ` : ''}
                    </dl>
                </div>
                ` : ''}
             `;
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
 * [HELPER] Classifica o texto bruto da escala em uma chave de status.
 */
function _esc_normalizeStatusKey(raw) {
    if (!raw || typeof raw !== 'string' || raw.trim() === '') return 'none';
    
    const rawTrimmed = raw.trim();
    const s = normalizeString(raw);
    const rawLower = rawTrimmed.toLowerCase();
    const rawUpper = rawTrimmed.toUpperCase();
    
    // Priority checks first
    if (s.includes('ausencia') || s.includes('falta')) return 'absent';
    if (s.includes('reposi') || s.includes('reposição')) return 'makeup';
    if (s.includes('folga') || s.includes('descanso')) return 'off';
    
    // Check if it's an aula (class) - including HCX, Aula Inicial
    if (s.includes('aula') || s.includes('hcx') || s.includes('inicial')) {
        return 'aula'; // Azul
    }
    
    // Check for N (Night shift) - noturno
    if (rawUpper === 'N' || rawUpper.startsWith('N ') || rawUpper.startsWith('N-') || 
        rawLower.includes('noite') || rawLower.includes('noturno')) {
        return 'noturno'; // Purple
    }
    
    // Check for plantão (by text or long shifts 19h-7h type patterns)
    if (rawLower.includes('plantao') || rawLower.includes('plantão')) {
        return 'plantao'; // Roxo
    }
    
    // Check for M (Morning shift) or T (Afternoon shift) - regular presence
    if (rawUpper === 'M' || rawUpper.startsWith('M ') || rawUpper.startsWith('M-') || 
        rawLower.includes('manhã') || rawLower.includes('manha') ||
        rawUpper === 'T' || rawUpper.startsWith('T ') || rawUpper.startsWith('T-') || 
        rawLower.includes('tarde')) {
        return 'presenca'; // Verde
    }
    
    // Check if has time format (indicates presence) - combined regex for efficiency
    if (/\d{1,2}(:\d{2}|h)|(as|às|a)\s*\d/.test(rawLower)) {
        return 'presenca'; // Verde
    }
    
    // GPS, AB and similar method codes = presence
    if (rawUpper.includes('GPS') || rawUpper.includes('AB') || rawLower.includes('metodo') || rawLower.includes('método')) {
        return 'presenca'; // Verde
    }
    
    // Fallback: if has any text, assume presence
    if (s.length > 0) return 'presenca'; // Verde
    
    return 'none';
}

/**
 * [HELPER] Retorna o rótulo legível para uma chave de status.
 */
function _esc_getHumanLabel(key) {
    return {
        'presenca': 'Presença',
        'plantao': 'Plantão',
        'noturno': 'Noturno',
        'aula': 'Aula',
        'absent': 'Ausência',
        'makeup': 'Reposição',
        'off': 'Folga',
        'none': 'Sem Dado',
        'atraso': 'Atraso'
    }[key] || 'Sem Dado';
}

/**
 * [BANCO DE HORAS] Constantes de horas
 */
const HORAS_AULA = 5; // Aulas iniciais ou qualquer tipo de aula = 5 horas
const HORAS_PADRAO = 5; // Horas padrão quando não há informação de horário específico
const HORAS_MAX_VALIDAS = 24; // Máximo de horas válidas por dia
const HORAS_MIN_VALIDAS = 1; // Mínimo de horas válidas por turno
const TOLERANCIA_ATRASO_MINUTOS = 10; // 10 minutos de tolerância para atraso

// Limites de turnos para classificação
const TURNO_LIMITS = {
    MANHA_INICIO: 6,   // 6h é o início típico da manhã
    TARDE_INICIO: 12,  // 12h é o início típico da tarde
    NOITE_INICIO: 18   // 18h é o início típico da noite
};

/**
 * [BANCO DE HORAS] Converte uma string de horário para minutos totais
 * @param {string} timeString - Horário no formato "HH:MM", "H:MM", "HH", ou "Hh"
 * @returns {number|null} Minutos totais desde meia-noite, ou null se inválido
 */
function _bh_parseTimeToMinutes(timeString) {
    if (!timeString || typeof timeString !== 'string') {
        return null;
    }
    
    // Match formats: "07:30", "7:30", "07:30:00", "7h", "07h"
    const match = timeString.match(/(\d{1,2}):?(\d{2})?/);
    if (!match) {
        return null;
    }
    
    const hours = parseInt(match[1], 10);
    const minutes = match[2] ? parseInt(match[2], 10) : 0;
    
    // Validate ranges
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
        return null;
    }
    
    return hours * 60 + minutes;
}

/**
 * [BANCO DE HORAS] Calcula horas a partir de um intervalo de horários
 * @param {string} valor - Valor da escala (ex: "07:00:00 às 12:00:00", "7h às 12h", "Aula Inicial")
 * @returns {object} { horas: number, tipo: string, compareceu: boolean }
 */
function _bh_calcularHorasDoValor(valor) {
    if (!valor || typeof valor !== 'string') {
        return { horas: 0, tipo: 'vazio', compareceu: false };
    }
    
    const valorTrimmed = valor.trim();
    if (valorTrimmed === '') {
        return { horas: 0, tipo: 'vazio', compareceu: false };
    }
    
    const valorLower = valorTrimmed.toLowerCase();
    const valorNorm = normalizeString(valor);
    
    // Verificar se é ausência/falta - NÃO contabiliza horas feitas
    if (valorLower.includes('ausencia') || valorLower.includes('ausência') || 
        valorLower.includes('falta') || valorLower === 'f') {
        return { horas: 0, tipo: 'ausencia', compareceu: false };
    }
    
    // Verificar se é folga/descanso - NÃO contabiliza horas
    if (valorNorm.includes('folga') || valorNorm.includes('descanso')) {
        return { horas: 0, tipo: 'folga', compareceu: false };
    }
    
    // Verificar se é aula (Aula Inicial, HCX, etc.) - 5 horas
    if (valorLower.includes('aula') || valorLower.includes('hcx') || valorLower.includes('inicial')) {
        return { horas: HORAS_AULA, tipo: 'aula', compareceu: true };
    }
    
    // Tentar extrair intervalo de horário no formato "HH:MM:SS às HH:MM:SS"
    const fullTimeMatch = valorTrimmed.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*(?:às|as|a|-)\s*(\d{1,2}):(\d{2})(?::\d{2})?/i);
    if (fullTimeMatch) {
        const horaEntrada = parseInt(fullTimeMatch[1], 10);
        const minEntrada = parseInt(fullTimeMatch[2], 10);
        const horaSaida = parseInt(fullTimeMatch[3], 10);
        const minSaida = parseInt(fullTimeMatch[4], 10);
        
        // Validar horas e minutos
        if (horaEntrada < 0 || horaEntrada > 23 || horaSaida < 0 || horaSaida > 23 ||
            minEntrada < 0 || minEntrada > 59 || minSaida < 0 || minSaida > 59) {
            console.warn(`[_bh_calcularHorasDoValor] Horário inválido: ${valor}`);
            return { horas: HORAS_PADRAO, tipo: 'horario_invalido', compareceu: true };
        }
        
        let minutosEntrada = horaEntrada * 60 + minEntrada;
        let minutosSaida = horaSaida * 60 + minSaida;
        
        // Ajustar para casos onde o horário de saída é menor (plantão noturno)
        if (minutosSaida < minutosEntrada) {
            minutosSaida += 24 * 60; // Adiciona 24 horas em minutos
        }
        
        const diferencaMinutos = minutosSaida - minutosEntrada;
        const horas = Number.parseFloat((diferencaMinutos / 60).toFixed(1));
        
        // Validar resultado - deve estar entre limites razoáveis
        if (horas < HORAS_MIN_VALIDAS || horas > HORAS_MAX_VALIDAS) {
            console.warn(`[_bh_calcularHorasDoValor] Duração fora dos limites (${horas}h) para: ${valor}`);
            return { horas: HORAS_PADRAO, tipo: 'horario_invalido', compareceu: true };
        }
        
        return { horas: horas, tipo: 'horario', compareceu: true };
    }
    
    // Tentar extrair formato legado "7h às 12h"
    const legacyMatch = valorTrimmed.match(/(\d{1,2})h\s*(?:às|as|a)?\s*(\d{1,2})h/i);
    if (legacyMatch) {
        const horaEntrada = parseInt(legacyMatch[1], 10);
        const horaSaida = parseInt(legacyMatch[2], 10);
        
        // Validar horas
        if (horaEntrada < 0 || horaEntrada > 23 || horaSaida < 0 || horaSaida > 23) {
            console.warn(`[_bh_calcularHorasDoValor] Horário inválido (legado): ${valor}`);
            return { horas: HORAS_PADRAO, tipo: 'horario_invalido', compareceu: true };
        }
        
        let horas = horaSaida - horaEntrada;
        // Ajustar para plantão noturno
        if (horas < 0) {
            horas += 24;
        }
        
        // Validar resultado
        if (horas < HORAS_MIN_VALIDAS || horas > HORAS_MAX_VALIDAS) {
            console.warn(`[_bh_calcularHorasDoValor] Duração fora dos limites (${horas}h) para: ${valor}`);
            return { horas: HORAS_PADRAO, tipo: 'horario_invalido', compareceu: true };
        }
        
        return { horas: horas, tipo: 'horario', compareceu: true };
    }
    
    // Se tem "presente" ou similar, contabilizar com horas padrão
    if (valorLower.includes('presente') || valorLower.includes('compareceu')) {
        return { horas: HORAS_PADRAO, tipo: 'presente', compareceu: true };
    }
    
    // Reposição também conta - usar horas padrão
    if (valorLower.includes('reposi')) {
        return { horas: HORAS_PADRAO, tipo: 'reposicao', compareceu: true };
    }
    
    // Se tem códigos M, T, N sem horário específico - isso indica apenas turno agendado, não presença
    const valorUpper = valorTrimmed.toUpperCase();
    if (valorUpper === 'M' || valorUpper.startsWith('M ') || valorUpper.startsWith('M-')) {
        return { horas: HORAS_PADRAO, tipo: 'turno_M', compareceu: false, agendado: true };
    }
    if (valorUpper === 'T' || valorUpper.startsWith('T ') || valorUpper.startsWith('T-')) {
        return { horas: HORAS_PADRAO, tipo: 'turno_T', compareceu: false, agendado: true };
    }
    if (valorUpper === 'N' || valorUpper.startsWith('N ') || valorUpper.startsWith('N-')) {
        return { horas: 12, tipo: 'turno_N', compareceu: false, agendado: true };
    }
    
    // Valor desconhecido - se não está vazio, pode ser presença sem detalhes
    // Ser conservador e logar para investigação
    if (valorTrimmed.length > 0 && !valorLower.includes('folga') && !valorLower.includes('descanso')) {
        console.warn(`[_bh_calcularHorasDoValor] Valor desconhecido tratado como presença: "${valor}"`);
        return { horas: HORAS_PADRAO, tipo: 'outro', compareceu: true };
    }
    
    return { horas: 0, tipo: 'desconhecido', compareceu: false };
}

/**
 * [BANCO DE HORAS] Calcula o banco de horas do aluno
 * Agora usa APENAS as Escalas (Escala1, Escala2, etc.) para calcular horas.
 * Os valores nas escalas contêm horários específicos como "07:00:00 às 12:00:00".
 * EscalaAtual é usada apenas para obter o setor/supervisor.
 * 
 * @param {string} emailNorm - Email normalizado do aluno
 * @param {string} nomeNorm - Nome normalizado do aluno
 * @param {Array} escalas - Array de escalas do aluno (Escala1, Escala2, etc.)
 * @returns {object} Dados do banco de horas
 */
function calcularBancoHoras(emailNorm, nomeNorm, escalas) {
    console.log('[calcularBancoHoras v3] Iniciando cálculo para:', { emailNorm, nomeNorm });
    console.log('[calcularBancoHoras v3] Escalas recebidas:', escalas?.length || 0);
    
    const resultado = {
        setor: null,
        supervisor: null,
        unidade: null,
        horasFeitas: 0,
        horasPrevistas: 0,
        horasPendentes: 0,
        saldo: 0,
        diasCompareceu: 0,
        diasDeveria: 0,
        diasFaltou: 0,
        // Novo: Mini Panel - Resumo de Frequência
        aulas: 0,
        presencas: 0,
        ausencias: 0,
        atrasos: 0,
        detalhes: []
    };
    
    // [NOVO] Buscar setor/supervisor das NotasPraticas (NotasPraticas1 = Escala1)
    // Primeiro, descobrir qual é a escala atual do aluno
    if (escalas && escalas.length > 0) {
        const escalaAtual = escalas[escalas.length - 1]; // Pega a última (mais recente)
        const nomeEscalaAtual = escalaAtual.nomeEscala || '';
        
        // Extrair o número da escala (ex: Escala1 -> 1, EscalaPratica2 -> 2)
        const escalaNumMatch = nomeEscalaAtual.match(/(\d+)$/);
        const escalaNum = escalaNumMatch ? escalaNumMatch[1] : null;
        
        if (escalaNum && appState.notasPraticas) {
            // Procurar NotasPraticas correspondente (NotasPraticas1 = Escala1)
            const possibleNpNames = [
                `NotasPraticas${escalaNum}`,
                `np${escalaNum}`,
                `NP${escalaNum}`,
                `Notas Praticas ${escalaNum}`,
                `Notas Práticas ${escalaNum}`
            ];
            
            for (const npName of possibleNpNames) {
                const notasPratica = appState.notasPraticas[npName];
                if (notasPratica && notasPratica.registros) {
                    // Buscar o registro do aluno nesta NotasPraticas
                    const registroAluno = notasPratica.registros.find(r => {
                        const rEmailNorm = normalizeString(r.EmailHC || r.emailHC || '');
                        const rNomeNorm = normalizeString(r.NomeCompleto || r.nomeCompleto || '');
                        return (rEmailNorm && rEmailNorm === emailNorm) ||
                               (rNomeNorm && rNomeNorm === nomeNorm);
                    });
                    
                    if (registroAluno) {
                        resultado.setor = registroAluno.Setor || registroAluno.setor || 
                                          registroAluno.Unidade || registroAluno.unidade || null;
                        resultado.supervisor = registroAluno.Supervisor || registroAluno.supervisor || null;
                        resultado.unidade = registroAluno.Unidade || registroAluno.unidade || resultado.setor;
                        console.log(`[calcularBancoHoras v3] ✅ Setor/Supervisor encontrado em ${npName}:`, {
                            setor: resultado.setor,
                            supervisor: resultado.supervisor
                        });
                        break;
                    }
                }
            }
        }
    }
    
    // Fallback: Buscar informações do setor/supervisor na EscalaAtual (se NotasPraticas não encontrou)
    if (!resultado.setor) {
        const setores = [
            { data: appState.escalaAtualEnfermaria, nome: 'Enfermaria' },
            { data: appState.escalaAtualUTI, nome: 'UTI' },
            { data: appState.escalaAtualCardiopediatria, nome: 'Cardiopediatria' }
        ];
        
        for (const setor of setores) {
            if (setor.data && setor.data.alunos && setor.data.alunos.length > 0) {
                const aluno = setor.data.alunos.find(a => {
                    const aEmailNorm = normalizeString(a.EmailHC || '');
                    const aNomeNorm = normalizeString(a.NomeCompleto || '');
                    return (aEmailNorm && aEmailNorm === emailNorm) || 
                           (aNomeNorm && aNomeNorm === nomeNorm);
                });
                
                if (aluno) {
                    resultado.setor = setor.nome;
                    resultado.supervisor = aluno.Supervisor || aluno.supervisor || null;
                    resultado.unidade = aluno.Unidade || aluno.unidade || setor.nome;
                    console.log(`[calcularBancoHoras v3] ✅ Setor do aluno (fallback EscalaAtual): ${setor.nome}`);
                    break;
                }
            }
        }
    }
    
    // Se não há escalas, retornar resultado vazio
    if (!escalas || escalas.length === 0) {
        console.warn('[calcularBancoHoras v3] ⚠️ Nenhuma escala encontrada para o aluno');
        return resultado;
    }
    
    // Processar cada escala (Escala1, Escala2, etc.)
    // O aluno já foi filtrado antes, então a escala contém os dados do aluno
    const diasProcessados = new Map(); // ISO date -> dados calculados
    
    escalas.forEach((escala, escalaIdx) => {
        const headersDay = escala.headersDay || [];
        const nomeEscala = escala.nomeEscala || `Escala${escalaIdx + 1}`;
        const tipoEscala = escala.tipo || 'pratica';
        
        console.log(`[calcularBancoHoras v3] Processando ${nomeEscala}:`, {
            tipo: tipoEscala,
            diasDisponiveis: headersDay.length
        });
        
        // [NOVO] Extrair horário agendado da escala para detecção de atraso
        // O horário agendado geralmente está no formato "07:00:00 às 12:00:00"
        // Precisamos do horário de entrada previsto
        
        headersDay.forEach(ddmm => {
            const dateObj = _esc_parseDMInferYear(ddmm);
            if (!dateObj) return;
            
            const iso = _esc_iso(dateObj);
            
            // Verificar se já processamos este dia (evitar duplicação)
            if (diasProcessados.has(iso)) {
                // Se já existe, atualizar apenas se o novo tem mais informação
                const existing = diasProcessados.get(iso);
                const valorAtual = escala[ddmm] || '';
                const horasAtual = _bh_calcularHorasDoValor(valorAtual);
                
                // Preferir valor com presença confirmada
                if (horasAtual.compareceu && !existing.compareceu) {
                    diasProcessados.set(iso, {
                        ...existing,
                        ...horasAtual,
                        valor: valorAtual,
                        escala: nomeEscala
                    });
                }
                return;
            }
            
            // Obter o valor do dia para o aluno
            const valor = escala[ddmm] || '';
            const horasCalc = _bh_calcularHorasDoValor(valor);
            
            // Log para debug
            if (valor) {
                console.log(`[calcularBancoHoras v3] ${ddmm} (${nomeEscala}): "${valor}" => ${horasCalc.horas}h, tipo: ${horasCalc.tipo}, compareceu: ${horasCalc.compareceu}`);
            }
            
            diasProcessados.set(iso, {
                data: iso,
                ddmm: ddmm,
                valor: valor,
                escala: nomeEscala,
                tipoEscala: tipoEscala,
                ...horasCalc
            });
        });
    });
    
    console.log(`[calcularBancoHoras v3] Total de dias processados: ${diasProcessados.size}`);
    
    // Calcular totais a partir dos dias processados
    diasProcessados.forEach((dia, iso) => {
        // Ignorar dias vazios, folgas e desconhecidos
        if (dia.tipo === 'vazio' || dia.tipo === 'folga' || dia.tipo === 'desconhecido') {
            return;
        }
        
        // Se é um turno agendado (M, T, N) sem presença confirmada via horário
        if (dia.agendado && !dia.compareceu) {
            resultado.horasPrevistas += dia.horas;
            resultado.diasDeveria++;
            resultado.horasPendentes += dia.horas;
            resultado.diasFaltou++;
            resultado.ausencias++; // [NOVO] Contar ausências
            
            resultado.detalhes.push({
                data: iso,
                ddmm: dia.ddmm,
                tipo: dia.tipo,
                horas: dia.horas,
                status: 'pendente',
                valor: dia.valor,
                escala: dia.escala
            });
            return;
        }
        
        // Dia com horário específico ou aula
        if (dia.compareceu) {
            resultado.horasPrevistas += dia.horas;
            resultado.horasFeitas += dia.horas;
            resultado.diasDeveria++;
            resultado.diasCompareceu++;
            
            // [NOVO] Determinar se é aula ou presença regular
            if (dia.tipo === 'aula') {
                resultado.aulas++;
            } else {
                resultado.presencas++;
            }
            
            // [NOVO] Verificar atraso - se há horário agendado e horário real de entrada
            // O formato esperado é "07:00:00 às 12:00:00" ou "7h às 12h"
            let isAtraso = false;
            if (dia.tipo === 'horario' && dia.valor) {
                // Extrair horário agendado (primeiro horário no valor)
                const minutosAgendados = _bh_parseTimeToMinutes(dia.valor);
                
                if (minutosAgendados !== null) {
                    // Buscar registro de ponto real do aluno para este dia
                    // O ponto real está em pontoStaticRows ou pontoPraticaRows
                    const pontoHoje = pontoState.byDate.get(iso);
                    if (pontoHoje) {
                        // Encontrar o registro do aluno
                        const registroAluno = pontoHoje.find(p => {
                            const pEmail = normalizeString(p.EmailHC || p.emailHC || '');
                            const pNome = normalizeString(p.NomeCompleto || p.nomeCompleto || '');
                            return (pEmail && pEmail === emailNorm) || (pNome && pNome === nomeNorm);
                        });
                        
                        if (registroAluno) {
                            const horaEntradaReal = registroAluno.HoraEntrada || registroAluno.horaEntrada || '';
                            const minutosReais = _bh_parseTimeToMinutes(horaEntradaReal);
                            
                            if (minutosReais !== null) {
                                // Verificar se chegou atrasado (com tolerância)
                                if (minutosReais > minutosAgendados + TOLERANCIA_ATRASO_MINUTOS) {
                                    isAtraso = true;
                                    resultado.atrasos++;
                                    const horaAgendada = Math.floor(minutosAgendados / 60);
                                    const minAgendado = minutosAgendados % 60;
                                    const horaReal = Math.floor(minutosReais / 60);
                                    const minReal = minutosReais % 60;
                                    console.log(`[calcularBancoHoras v3] ⚠️ ATRASO detectado em ${dia.ddmm}: agendado ${horaAgendada}:${String(minAgendado).padStart(2, '0')}, chegou ${horaReal}:${String(minReal).padStart(2, '0')}`);
                                }
                            }
                        }
                    }
                }
            }
            
            resultado.detalhes.push({
                data: iso,
                ddmm: dia.ddmm,
                tipo: dia.tipo,
                horas: dia.horas,
                status: isAtraso ? 'atraso' : 'presente',
                valor: dia.valor,
                escala: dia.escala
            });
        } else if (dia.tipo === 'ausencia') {
            // Ausência registrada - usar horas padrão já que não temos o horário original agendado
            resultado.horasPrevistas += HORAS_PADRAO;
            resultado.horasPendentes += HORAS_PADRAO;
            resultado.diasDeveria++;
            resultado.diasFaltou++;
            resultado.ausencias++; // [NOVO] Contar ausências
            
            resultado.detalhes.push({
                data: iso,
                ddmm: dia.ddmm,
                tipo: dia.tipo,
                horas: HORAS_PADRAO,
                status: 'ausente',
                valor: dia.valor,
                escala: dia.escala
            });
        }
    });
    
    // Calcular saldo (positivo = em dia, negativo = deve horas)
    resultado.saldo = resultado.horasFeitas - resultado.horasPendentes;
    
    console.log('[calcularBancoHoras v3] Resultado final:', resultado);
    
    return resultado;
}

/**
 * [BANCO DE HORAS] Atualiza a interface do banco de horas
 * @param {object} bancoHoras - Dados do banco de horas
 */
function renderizarBancoHoras(bancoHoras) {
    console.log('[renderizarBancoHoras] Renderizando:', bancoHoras);
    
    // Elementos do DOM
    const $setor = document.getElementById('banco-horas-setor');
    const $supervisor = document.getElementById('banco-horas-supervisor');
    const $statusBadge = document.getElementById('banco-horas-status-badge');
    const $saldoTotal = document.getElementById('banco-horas-saldo-total');
    const $saldoIndicator = document.getElementById('banco-horas-saldo-indicator');
    const $progressBar = document.getElementById('banco-horas-progress-bar');
    const $progressText = document.getElementById('banco-horas-progress-text');
    const $horasFeitas = document.getElementById('banco-horas-feitas');
    const $horasFeitasDetail = document.getElementById('banco-horas-feitas-detail');
    const $horasPrevistas = document.getElementById('banco-horas-previstas');
    const $horasPrevistasDetail = document.getElementById('banco-horas-previstas-detail');
    const $horasPendentes = document.getElementById('banco-horas-pendentes');
    const $horasPendentesDetail = document.getElementById('banco-horas-pendentes-detail');
    const $manha = document.getElementById('banco-horas-manha');
    const $tarde = document.getElementById('banco-horas-tarde');
    const $noturno = document.getElementById('banco-horas-noturno');
    
    // Setor e Unidade
    if ($setor) {
        const setorText = bancoHoras.setor || bancoHoras.unidade || '--';
        $setor.textContent = `Setor: ${setorText}`;
    }
    
    // Supervisor (novo campo da EscalaAtual)
    if ($supervisor) {
        if (bancoHoras.supervisor) {
            $supervisor.textContent = `Supervisor: ${bancoHoras.supervisor}`;
            $supervisor.style.display = 'block';
        } else {
            $supervisor.style.display = 'none';
        }
    }
    
    // Status badge
    if ($statusBadge) {
        $statusBadge.classList.remove('banco-horas-badge--warning', 'banco-horas-badge--danger');
        const badgeText = $statusBadge.querySelector('.banco-horas-badge-text');
        
        if (bancoHoras.horasPendentes === 0) {
            if (badgeText) badgeText.textContent = 'Em dia';
        } else if (bancoHoras.horasPendentes <= 10) {
            $statusBadge.classList.add('banco-horas-badge--warning');
            if (badgeText) badgeText.textContent = 'Atenção';
        } else {
            $statusBadge.classList.add('banco-horas-badge--danger');
            if (badgeText) badgeText.textContent = 'Pendências';
        }
    }
    
    // Saldo total
    if ($saldoTotal) {
        const saldoFormatted = bancoHoras.saldo >= 0 ? `+${bancoHoras.saldo}h` : `${bancoHoras.saldo}h`;
        $saldoTotal.textContent = saldoFormatted;
    }
    
    // Indicador de saldo
    if ($saldoIndicator) {
        $saldoIndicator.classList.remove('banco-horas-kpi-indicator--warning', 'banco-horas-kpi-indicator--danger');
        
        if (bancoHoras.saldo >= 0) {
            $saldoIndicator.innerHTML = `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>`;
        } else if (bancoHoras.saldo >= -10) {
            $saldoIndicator.classList.add('banco-horas-kpi-indicator--warning');
            $saldoIndicator.innerHTML = `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>`;
        } else {
            $saldoIndicator.classList.add('banco-horas-kpi-indicator--danger');
            $saldoIndicator.innerHTML = `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>`;
        }
    }
    
    // Progress bar
    if ($progressBar && $progressText) {
        const percentualRaw = bancoHoras.horasPrevistas > 0 
            ? Math.round((bancoHoras.horasFeitas / bancoHoras.horasPrevistas) * 100)
            : 0;
        const percentual = Math.min(percentualRaw, 100); // Cap at 100% for display
        
        $progressBar.style.width = `${percentual}%`;
        $progressText.textContent = percentualRaw > 100 ? `${percentualRaw}%` : `${percentual}%`;
        
        $progressBar.classList.remove('banco-horas-kpi-progress-bar--warning', 'banco-horas-kpi-progress-bar--danger');
        
        if (percentualRaw < 50) {
            $progressBar.classList.add('banco-horas-kpi-progress-bar--danger');
        } else if (percentualRaw < 80) {
            $progressBar.classList.add('banco-horas-kpi-progress-bar--warning');
        }
    }
    
    // Horas feitas
    if ($horasFeitas) {
        $horasFeitas.textContent = `${bancoHoras.horasFeitas}h`;
    }
    if ($horasFeitasDetail) {
        $horasFeitasDetail.textContent = `Compareceu em ${bancoHoras.diasCompareceu} dia${bancoHoras.diasCompareceu !== 1 ? 's' : ''}`;
    }
    
    // Horas previstas
    if ($horasPrevistas) {
        $horasPrevistas.textContent = `${bancoHoras.horasPrevistas}h`;
    }
    if ($horasPrevistasDetail) {
        $horasPrevistasDetail.textContent = `Deveria comparecer em ${bancoHoras.diasDeveria} dia${bancoHoras.diasDeveria !== 1 ? 's' : ''}`;
    }
    
    // Horas pendentes
    if ($horasPendentes) {
        $horasPendentes.textContent = `${bancoHoras.horasPendentes}h`;
        
        $horasPendentes.classList.remove('banco-horas-kpi-value--success', 'banco-horas-kpi-value--warning', 'banco-horas-kpi-value--danger');
        
        if (bancoHoras.horasPendentes === 0) {
            $horasPendentes.classList.add('banco-horas-kpi-value--success');
        } else if (bancoHoras.horasPendentes <= 10) {
            $horasPendentes.classList.add('banco-horas-kpi-value--warning');
        } else {
            $horasPendentes.classList.add('banco-horas-kpi-value--danger');
        }
    }
    if ($horasPendentesDetail) {
        $horasPendentesDetail.textContent = `Faltou em ${bancoHoras.diasFaltou} dia${bancoHoras.diasFaltou !== 1 ? 's' : ''}`;
    }
    
    // [NOVO] Mini Panel - Resumo de Frequência (Aulas, Presenças, Ausências, Atrasos)
    const $aulas = document.getElementById('banco-horas-aulas');
    const $presencas = document.getElementById('banco-horas-presencas');
    const $ausencias = document.getElementById('banco-horas-ausencias');
    const $atrasos = document.getElementById('banco-horas-atrasos');
    
    if ($aulas) {
        $aulas.textContent = bancoHoras.aulas || 0;
    }
    if ($presencas) {
        $presencas.textContent = bancoHoras.presencas || 0;
    }
    if ($ausencias) {
        $ausencias.textContent = bancoHoras.ausencias || 0;
    }
    if ($atrasos) {
        $atrasos.textContent = bancoHoras.atrasos || 0;
    }
}

/**
 * [ORION] Renderiza a aba de escala (v33.0 - Modern Professional Design)
 * Redesign completo com layout moderno e profissional para visualização de escalas
 * @param {Array} escalas - O array de escalas do aluno (de findDataByStudent).
 */
function renderTabEscala(escalas) {
    console.log("[ORION renderTabEscala v33.0] Renderizando. Escalas:", escalas);

    const $switcher = document.getElementById('escala-switcher-container');
    const $periodLabel = document.getElementById('escala-periodo-label');
    const $grid = document.getElementById('escala-heatmap-grid');
    const $tabPratica = document.getElementById('escala-tab-pratica');
    const $tabTeoria = document.getElementById('escala-tab-teoria');
    const $praticaCount = document.getElementById('escala-pratica-count');
    const $teoriaCount = document.getElementById('escala-teoria-count');
    const $resumoTitle = document.getElementById('escala-resumo-title');

    if (!$switcher || !$periodLabel || !$grid) {
        console.error("ORION: Estrutura da #tab-escala (v33.0) não encontrada. Abortando.");
        return;
    }
    
    // Helper function to safely update period label text
    function updatePeriodLabel(element, text) {
        const span = element.querySelector('span');
        if (span) {
            span.textContent = text;
        } else {
            element.textContent = text;
        }
    }

    const alunoEmailRaw = document.querySelector('#tab-info dd')?.textContent || '';
    const alunoNomeRaw = document.querySelector('#student-header h2')?.textContent || '';
    const alunoEmailNorm = normalizeString(alunoEmailRaw);
    const alunoNomeNorm = normalizeString(alunoNomeRaw);
    
    $switcher.innerHTML = '';
    updatePeriodLabel($periodLabel, 'Selecione uma escala');
    $grid.innerHTML = `
        <div class="escala-empty-state">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"/>
            </svg>
            <p>Selecione uma escala acima para visualizar os dias</p>
        </div>
    `;

    if (!escalas || escalas.length === 0) {
        $switcher.innerHTML = '<p class="escala-empty-message">Nenhuma escala encontrada para este aluno.</p>';
        if ($praticaCount) $praticaCount.textContent = '0';
        if ($teoriaCount) $teoriaCount.textContent = '0';
        return;
    }

    // Separate scales into practical and theoretical
    const escalasPraticas = [];
    const escalasTeoricas = [];
    
    escalas.forEach((escala) => {
        const tipo = escala.tipo || 'pratica';
        if (tipo === 'teoria') {
            escalasTeoricas.push(escala);
        } else {
            escalasPraticas.push(escala);
        }
    });
    
    // Update counts
    if ($praticaCount) $praticaCount.textContent = escalasPraticas.length.toString();
    if ($teoriaCount) $teoriaCount.textContent = escalasTeoricas.length.toString();
    
    // Current active type
    let activeType = 'pratica';
    
    // Calculate absences for the student
    const absentDatesTotal = new Set();
    const makeupDatesTotal = new Set();
    appState.ausenciasReposicoes.forEach(f => {
        const fMail = normalizeString(f.EmailHC || '');
        if (fMail && fMail === alunoEmailNorm) {
            if (f.DataAusenciaISO) absentDatesTotal.add(f.DataAusenciaISO);
            if (f.DataReposicaoISO) makeupDatesTotal.add(f.DataReposicaoISO);
        }
    });

    // [NOVO] Calcular e renderizar o Banco de Horas
    try {
        const bancoHoras = calcularBancoHoras(alunoEmailNorm, alunoNomeNorm, escalas);
        renderizarBancoHoras(bancoHoras);
    } catch (error) {
        console.error('[renderTabEscala] Erro ao calcular banco de horas:', error);
    }

    // Function to render scale pills
    function renderScalePills(scalesArray, type) {
        $switcher.innerHTML = '';
        
        if (scalesArray.length === 0) {
            const typeLabel = type === 'teoria' ? 'teóricas' : 'práticas';
            $switcher.innerHTML = `<p class="escala-empty-message">Nenhuma escala ${typeLabel} encontrada.</p>`;
            $grid.innerHTML = `
                <div class="escala-empty-state">
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"/>
                    </svg>
                    <p>Não há escalas ${typeLabel} disponíveis</p>
                </div>
            `;
            return;
        }
        
        scalesArray.forEach((escala, idx) => {
            // Format scale name for display: extract number from "EscalaTeoria1", "EscalaPratica1", or "Escala1"
            // Display the proper label based on scale type with proper validation
            let nome = escala.nomeEscala || `Escala ${idx + 1}`;
            const scaleNum = nome.match(/\d+/)?.[0] || (idx + 1);
            
            // Validate scale type and provide proper label (default to the passed type parameter)
            let tipoPretty;
            const scaleTipo = (escala.tipo || '').toLowerCase();
            if (scaleTipo === 'teoria') {
                tipoPretty = 'Teórica';
            } else if (scaleTipo === 'pratica') {
                tipoPretty = 'Prática';
            } else {
                // Fallback to the type parameter passed to the function
                tipoPretty = type === 'teoria' ? 'Teórica' : 'Prática';
            }
            nome = `Escala ${tipoPretty} ${scaleNum}`;
            
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `escala-pill escala-pill--${type}`;
            btn.textContent = nome;
            
            btn.addEventListener('click', () => {
                $switcher.querySelectorAll('.escala-pill').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                const escalaSummary = drawScaleGrid(escala, alunoEmailNorm, alunoNomeNorm, absentDatesTotal, makeupDatesTotal);
                _esc_renderSidebarSummary(escalaSummary, nome);
            });
            
            $switcher.appendChild(btn);
        });
        
        // Auto-click first scale
        const firstPill = $switcher.querySelector('.escala-pill');
        if (firstPill) {
            firstPill.click();
        }
    }
    
    // Tab switching functionality
    function setupTabSwitching() {
        if ($tabPratica) {
            $tabPratica.addEventListener('click', () => {
                if (activeType === 'pratica') return;
                activeType = 'pratica';
                $tabPratica.classList.add('escala-type-tab--active');
                if ($tabTeoria) $tabTeoria.classList.remove('escala-type-tab--active');
                renderScalePills(escalasPraticas, 'pratica');
            });
        }
        
        if ($tabTeoria) {
            $tabTeoria.addEventListener('click', () => {
                if (activeType === 'teoria') return;
                activeType = 'teoria';
                $tabTeoria.classList.add('escala-type-tab--active');
                if ($tabPratica) $tabPratica.classList.remove('escala-type-tab--active');
                renderScalePills(escalasTeoricas, 'teoria');
            });
        }
    }
    
    setupTabSwitching();

    // Function to draw the grid
    function drawScaleGrid(escala, emailNorm, nameNorm, absentDates, makeupDates) {
        
        const summary = {
            presenca: 0, plantao: 0, noturno: 0, aula: 0, absent: 0, makeup: 0, off: 0, atraso: 0
        };

        const diasBrutos = escala.headersDay || [];
        if (diasBrutos.length === 0) {
             $grid.innerHTML = `
                <div class="escala-empty-state">
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"/>
                    </svg>
                    <p>Esta escala não contém dias (headersDay ausente)</p>
                </div>
             `;
             return summary;
        }

        const diasMap = new Map();
        diasBrutos.forEach(ddmm => {
            const ddmmCorrigido = ddmm.includes('/') ? ddmm.split('/')[0] + '/' + ddmm.split('/')[1].padStart(2, '0') : ddmm;
            const dateObj = _esc_parseDMInferYear(ddmmCorrigido);
            
            if (dateObj) {
                const rawText = escala[ddmm] || ''; 
                diasMap.set(ddmmCorrigido, { dateObj, rawText });
            } else {
                console.warn(`Data inválida pulada: ${ddmm} (corrigido para ${ddmmCorrigido})`);
            }
        });

        if (diasMap.size === 0) {
            updatePeriodLabel($periodLabel, escala.nomeEscala || 'Escala');
            $grid.innerHTML = `
                <div class="escala-empty-state">
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"/>
                    </svg>
                    <p>Nenhum dia válido encontrado nesta escala</p>
                </div>
            `;
            return summary;
        }
        
        const sortedDias = Array.from(diasMap.values()).sort((a, b) => a.dateObj - b.dateObj);
        
        const firstDayOfScale = sortedDias[0].dateObj;
        const lastDayOfScale = sortedDias[sortedDias.length - 1].dateObj;

        updatePeriodLabel($periodLabel, `Período: ${firstDayOfScale.toLocaleDateString('pt-BR')} a ${lastDayOfScale.toLocaleDateString('pt-BR')}`);
        $grid.innerHTML = '';
        const todayISO = new Date().toISOString().slice(0, 10);
        
        sortedDias.forEach(day => {
            
            const iso = _esc_iso(day.dateObj);
            let rawText = day.rawText;
            let statusKey = _esc_normalizeStatusKey(rawText);

            if (makeupDates.has(iso)) {
                statusKey = 'makeup';
            }
            else if (absentDates.has(iso)) {
                statusKey = 'absent';
            }
            else {
                // Check ponto data for both today and historical days
                let pontoRecord = null;
                
                if (iso === todayISO) {
                    pontoRecord = resolvePontoHojeRecordFromIdentity({
                        normEmail: emailNorm,
                        normName: nameNorm
                    });
                } else {
                    // Check historical ponto data
                    const pontoData = pontoState.byDate.get(iso);
                    if (pontoData) {
                        pontoRecord = pontoData.find(p => {
                            const pEmail = normalizeString(p.EmailHC || p.emailHC || '');
                            const pNome = normalizeString(p.NomeCompleto || p.nomeCompleto || '');
                            return (pEmail && pEmail === emailNorm) || (pNome && pNome === nameNorm);
                        });
                    }
                }
                
                if (pontoRecord) {
                    const pontoStatus = _esc_normalizeStatusKey(rawText);
                    statusKey = (pontoStatus === 'plantao' || pontoStatus === 'aula' || pontoStatus === 'noturno') ? pontoStatus : 'presenca';
                    const horaEntradaPonto = pontoRecord.HoraEntrada || pontoRecord.horaEntrada || '';
                    
                    // [NOVO] Verificar atraso - comparar com horário agendado
                    if (horaEntradaPonto && day.rawText) {
                        const minutosAgendados = _bh_parseTimeToMinutes(day.rawText);
                        const minutosReais = _bh_parseTimeToMinutes(horaEntradaPonto);
                        
                        if (minutosAgendados !== null && minutosReais !== null) {
                            if (minutosReais > minutosAgendados + TOLERANCIA_ATRASO_MINUTOS) {
                                statusKey = 'atraso';
                                rawText = `Atraso (${horaEntradaPonto})`;
                            } else {
                                rawText = horaEntradaPonto ? `Presente (${horaEntradaPonto})` : 'Presente';
                            }
                        } else {
                            rawText = horaEntradaPonto ? `Presente (${horaEntradaPonto})` : 'Presente';
                        }
                    } else {
                        rawText = horaEntradaPonto ? `Presente (${horaEntradaPonto})` : 'Presente';
                    }
                }
            }

            if (summary[statusKey] !== undefined) {
                summary[statusKey]++;
            }
            
            const tile = createTile(day.dateObj, rawText, statusKey);
            $grid.appendChild(tile);
        });

        return summary;
    }

    // Render sidebar summary with stats
    function _esc_renderSidebarSummary(summary, nomeEscala) {
        if ($resumoTitle) {
            $resumoTitle.textContent = `Resumo: ${nomeEscala}`;
        }
        
        // Update stats
        const $statPresenca = document.getElementById('stat-presenca');
        const $statPlantao = document.getElementById('stat-plantao');
        const $statNoturno = document.getElementById('stat-noturno');
        const $statAula = document.getElementById('stat-aula');
        const $statAbsent = document.getElementById('stat-absent');
        const $statMakeup = document.getElementById('stat-makeup');
        const $statOff = document.getElementById('stat-off');
        
        if ($statPresenca) $statPresenca.textContent = summary.presenca || 0;
        if ($statPlantao) $statPlantao.textContent = summary.plantao || 0;
        if ($statNoturno) $statNoturno.textContent = summary.noturno || 0;
        if ($statAula) $statAula.textContent = summary.aula || 0;
        if ($statAbsent) $statAbsent.textContent = summary.absent || 0;
        if ($statMakeup) $statMakeup.textContent = summary.makeup || 0;
        if ($statOff) $statOff.textContent = summary.off || 0;
    }

    // Function to create the tile HTML
    function createTile(dateObj, rawText, statusKey) {
        const tile = document.createElement('div');
        tile.className = 'compact-tile';
        tile.setAttribute('data-status', statusKey);
        
        const dayNumber = dateObj.getDate();
        const weekday = dateObj.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
        
        const humanStatus = _esc_getHumanLabel(statusKey);
        
        let bodyText = '';
        if (rawText && rawText.trim() !== '') {
            bodyText = rawText.trim();
        } else {
            bodyText = humanStatus;
        }
        
        const tooltipText = rawText && rawText.trim() !== '' ? rawText.trim() : humanStatus;
        tile.setAttribute('data-tip', tooltipText);

        tile.innerHTML = `
            <div class="tile-header">
                <span class="tile-weekday">${weekday}</span>
                <span class="tile-date">${dayNumber}</span>
            </div>
            <div class="tile-body-text" title="${tooltipText}">
                ${bodyText}
            </div>
            <div class="tile-footer">
                <div class="classification-pill">${humanStatus}</div>
            </div>
        `;
        return tile;
    }

    // Initial render - start with practical scales (if any) or theoretical
    if (escalasPraticas.length > 0) {
        renderScalePills(escalasPraticas, 'pratica');
    } else if (escalasTeoricas.length > 0) {
        activeType = 'teoria';
        if ($tabPratica) $tabPratica.classList.remove('escala-type-tab--active');
        if ($tabTeoria) $tabTeoria.classList.add('escala-type-tab--active');
        renderScalePills(escalasTeoricas, 'teoria');
    }
}

/* =======================================================================
 * FIM DO BLOCO DE SUBSTITUIÇÃO DA ESCALA (v32.7)
 * ======================================================================= */

/**
 * [MASTERPIECE] Renderiza a aba de Faltas com design moderno e profissional
 * Sistema inteligente de visualização de ausências e reposições
 * Inclui validação de datas contra a EscalaPratica do aluno
 */
function renderTabFaltas(faltas) {
    const container = document.getElementById('faltas-content');
    
    // Configuration constants
    const MOTIVO_MAX_LENGTH = 100;
    
    // ═══════════════════════════════════════════════════════════════════
    // EMPTY STATE - Design elegante para quando não há faltas
    // ═══════════════════════════════════════════════════════════════════
    if (!faltas || faltas.length === 0) {
        container.innerHTML = `
            <div class="faltas-empty-state">
                <div class="faltas-empty-icon">
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                </div>
                <h3 class="faltas-empty-title">Nenhuma Ausência Registrada</h3>
                <p class="faltas-empty-text">Este aluno não possui faltas registradas no sistema. Continue assim! 🎉</p>
            </div>
        `;
        return;
    }

    // ═══════════════════════════════════════════════════════════════════
    // VALIDAÇÃO DE ESCALA - Verifica datas contra EscalaPratica
    // ═══════════════════════════════════════════════════════════════════
    // Process each absence to add escala validation info
    const faltasComValidacao = faltas.map(f => {
        const escalaName = f.Escala || f.escala || '';
        const studentEmail = f.EmailHC || f.emailHC || '';
        const studentName = f.NomeCompleto || f.nomeCompleto || '';
        
        // Validate against EscalaPratica
        const validation = checkAbsenceAgainstEscala(
            f.DataAusenciaISO,
            escalaName,
            studentEmail,
            studentName
        );
        
        return {
            ...f,
            _escalaValidation: validation,
            _escalaName: escalaName
        };
    });

    // ═══════════════════════════════════════════════════════════════════
    // CÁLCULO DE ESTATÍSTICAS
    // ═══════════════════════════════════════════════════════════════════
    const totalFaltas = faltasComValidacao.length;
    const faltasPendentes = faltasComValidacao.filter(f => !f.DataReposicaoISO).length;
    const faltasRepostas = faltasComValidacao.filter(f => f.DataReposicaoISO).length;
    const taxaReposicao = totalFaltas > 0 ? Math.round((faltasRepostas / totalFaltas) * 100) : 0;
    
    // Count validated absences (dates that match the student's escala schedule)
    const faltasValidadas = faltasComValidacao.filter(f => f._escalaValidation && f._escalaValidation.isInSchedule).length;
    const faltasNaoValidadas = faltasComValidacao.filter(f => f._escalaValidation && !f._escalaValidation.isInSchedule && f._escalaName).length;

    // Ordenar faltas por data (mais recentes primeiro)
    const faltasOrdenadas = [...faltasComValidacao].sort((a, b) => {
        const dateA = a.DataAusenciaISO ? new Date(a.DataAusenciaISO) : new Date(0);
        const dateB = b.DataAusenciaISO ? new Date(b.DataAusenciaISO) : new Date(0);
        return dateB - dateA;
    });

    // ═══════════════════════════════════════════════════════════════════
    // GERAÇÃO DO HTML
    // ═══════════════════════════════════════════════════════════════════
    const html = `
        <!-- KPI Summary Cards -->
        <div class="faltas-kpi-grid">
            <div class="faltas-kpi-card faltas-kpi-card--total">
                <div class="faltas-kpi-icon">
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                </div>
                <div class="faltas-kpi-content">
                    <span class="faltas-kpi-value">${totalFaltas}</span>
                    <span class="faltas-kpi-label">Total de Ausências</span>
                </div>
            </div>
            
            <div class="faltas-kpi-card faltas-kpi-card--pending">
                <div class="faltas-kpi-icon">
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                </div>
                <div class="faltas-kpi-content">
                    <span class="faltas-kpi-value">${faltasPendentes}</span>
                    <span class="faltas-kpi-label">Pendentes</span>
                </div>
                ${faltasPendentes > 0 ? '<div class="faltas-kpi-alert-dot"></div>' : ''}
            </div>
            
            <div class="faltas-kpi-card faltas-kpi-card--completed">
                <div class="faltas-kpi-icon">
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                </div>
                <div class="faltas-kpi-content">
                    <span class="faltas-kpi-value">${faltasRepostas}</span>
                    <span class="faltas-kpi-label">Repostas</span>
                </div>
            </div>
            
            <div class="faltas-kpi-card faltas-kpi-card--rate">
                <div class="faltas-kpi-icon">
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                    </svg>
                </div>
                <div class="faltas-kpi-content">
                    <span class="faltas-kpi-value">${taxaReposicao}%</span>
                    <span class="faltas-kpi-label">Taxa de Reposição</span>
                </div>
                <div class="faltas-kpi-progress">
                    <div class="faltas-kpi-progress-bar" style="width: ${taxaReposicao}%"></div>
                </div>
            </div>
        </div>
        
        <!-- Timeline Section -->
        <div class="faltas-timeline-section">
            <div class="faltas-timeline-header">
                <h4 class="faltas-timeline-title">
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    Histórico de Ausências e Reposições
                </h4>
                <div class="faltas-timeline-legend">
                    <span class="faltas-legend-item faltas-legend-item--pending">
                        <span class="faltas-legend-dot"></span>
                        Pendente
                    </span>
                    <span class="faltas-legend-item faltas-legend-item--completed">
                        <span class="faltas-legend-dot"></span>
                        Reposta
                    </span>
                </div>
            </div>
            
            <div class="faltas-timeline">
                ${faltasOrdenadas.map((f, index) => {
                    const isPending = !f.DataReposicaoISO;
                    const statusClass = isPending ? 'faltas-card--pending' : 'faltas-card--completed';
                    const statusIcon = isPending ? 
                        '<path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />' :
                        '<path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />';
                    const statusText = isPending ? 'Pendente' : 'Reposta';
                    
                    const dataAusencia = f.DataAusenciaISO 
                        ? new Date(f.DataAusenciaISO + 'T00:00:00').toLocaleDateString('pt-BR', { 
                            weekday: 'short', 
                            day: '2-digit', 
                            month: 'short',
                            year: 'numeric',
                            timeZone: 'UTC' 
                        })
                        : 'Data não informada';
                    
                    const dataReposicao = f.DataReposicaoISO 
                        ? new Date(f.DataReposicaoISO + 'T00:00:00').toLocaleDateString('pt-BR', { 
                            weekday: 'short', 
                            day: '2-digit', 
                            month: 'short',
                            year: 'numeric',
                            timeZone: 'UTC' 
                        })
                        : 'Aguardando reposição';
                    
                    const local = f.Local || 'Local não informado';
                    const motivo = f.Motivo || 'Motivo não informado';
                    const motivoTruncado = motivo.length > MOTIVO_MAX_LENGTH ? motivo.substring(0, MOTIVO_MAX_LENGTH) + '...' : motivo;
                    
                    // Escala validation info
                    const escalaName = f._escalaName || '';
                    const escalaValidation = f._escalaValidation || {};
                    const isInSchedule = escalaValidation.isInSchedule;
                    const studentEscalaDates = escalaValidation.studentEscalaDates || [];
                    
                    // Build escala info HTML
                    let escalaInfoHtml = '';
                    if (escalaName) {
                        const validationClass = isInSchedule ? 'faltas-escala-badge--valid' : 'faltas-escala-badge--invalid';
                        const validationIcon = isInSchedule 
                            ? '<path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />'
                            : '<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />';
                        const validationText = isInSchedule 
                            ? 'Data confere com a escala' 
                            : (studentEscalaDates.length > 0 
                                ? 'Data não confere com a escala' 
                                : 'Não foi possível validar');
                        
                        escalaInfoHtml = `
                            <div class="faltas-card-escala">
                                <div class="faltas-escala-badge ${validationClass}">
                                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                        ${validationIcon}
                                    </svg>
                                    <span class="faltas-escala-name">${escalaName}</span>
                                </div>
                                <span class="faltas-escala-validation">${validationText}</span>
                                ${studentEscalaDates.length > 0 ? `
                                    <details class="faltas-escala-details">
                                        <summary>Ver datas da escala (${studentEscalaDates.length})</summary>
                                        <div class="faltas-escala-dates-list">
                                            ${studentEscalaDates.map(d => `<span class="faltas-escala-date">${d}</span>`).join('')}
                                        </div>
                                    </details>
                                ` : ''}
                            </div>
                        `;
                    }
                    
                    // Calculate days between absence and makeup
                    let diasParaRepor = '';
                    if (f.DataAusenciaISO && f.DataReposicaoISO) {
                        const ausDate = new Date(f.DataAusenciaISO);
                        const repDate = new Date(f.DataReposicaoISO);
                        const diffDays = Math.round((repDate - ausDate) / (1000 * 60 * 60 * 24));
                        diasParaRepor = `<span class="faltas-card-days">Reposta em ${diffDays} dias</span>`;
                    } else if (f.DataAusenciaISO && isPending) {
                        const ausDate = new Date(f.DataAusenciaISO);
                        const today = new Date();
                        const diffDays = Math.round((today - ausDate) / (1000 * 60 * 60 * 24));
                        diasParaRepor = `<span class="faltas-card-days faltas-card-days--warning">${diffDays} dias pendente</span>`;
                    }

                    return `
                        <div class="faltas-card ${statusClass}" style="animation-delay: ${index * 0.05}s">
                            <div class="faltas-card-timeline-marker">
                                <div class="faltas-card-timeline-dot"></div>
                                ${index < faltasOrdenadas.length - 1 ? '<div class="faltas-card-timeline-line"></div>' : ''}
                            </div>
                            
                            <div class="faltas-card-content">
                                <div class="faltas-card-header">
                                    <div class="faltas-card-status">
                                        <div class="faltas-card-status-icon">
                                            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                                ${statusIcon}
                                            </svg>
                                        </div>
                                        <span class="faltas-card-status-text">${statusText}</span>
                                    </div>
                                    ${diasParaRepor}
                                </div>
                                
                                ${escalaInfoHtml}
                                
                                <div class="faltas-card-dates">
                                    <div class="faltas-card-date faltas-card-date--absence">
                                        <span class="faltas-card-date-label">
                                            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                                <path stroke-linecap="round" stroke-linejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/>
                                            </svg>
                                            Ausência
                                        </span>
                                        <span class="faltas-card-date-value">${dataAusencia}</span>
                                    </div>
                                    
                                    <div class="faltas-card-date-arrow">
                                        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                            <path stroke-linecap="round" stroke-linejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                                        </svg>
                                    </div>
                                    
                                    <div class="faltas-card-date faltas-card-date--makeup ${isPending ? 'faltas-card-date--pending' : ''}">
                                        <span class="faltas-card-date-label">
                                            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                                <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                                            </svg>
                                            Reposição
                                        </span>
                                        <span class="faltas-card-date-value">${dataReposicao}</span>
                                    </div>
                                </div>
                                
                                <div class="faltas-card-details">
                                    <div class="faltas-card-detail">
                                        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                            <path stroke-linecap="round" stroke-linejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                            <path stroke-linecap="round" stroke-linejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                        </svg>
                                        <span>${local}</span>
                                    </div>
                                    <div class="faltas-card-detail faltas-card-detail--motivo" title="${motivo}">
                                        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                            <path stroke-linecap="round" stroke-linejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                                        </svg>
                                        <span>${motivoTruncado}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;

    container.innerHTML = html;
}

        /**
         * [MASTERPIECE] Renderiza a aba de Notas Teóricas com design revolucionário e artístico
         * Versão v35 - Theoretical Excellence Edition
         * Design glorioso digno do Portal de Ensino da USP
         */
        function renderTabNotasTeoricas(notas) {
            console.log('[renderTabNotasTeoricas v36 - InCor Professional] Dados recebidos:', notas);
            
            // Constants for grade validation
            const MIN_GRADE = 0;
            const MAX_GRADE = 10;
            const MIN_FIELDS_FOR_TABLE = 5;
            
            // Helper function to check if a value is a valid grade
            const isValidGrade = (value) => {
                if (value === undefined || value === null) return false;
                const numValue = parseNota(value);
                return numValue >= MIN_GRADE && numValue <= MAX_GRADE && String(value).match(/^[\d,\.]+$/);
            };
            
            // Helper function to get value from notas object with accent-insensitive key matching
            const getNotaValue = (materia) => {
                if (!notas) return undefined;
                // Try exact match first
                if (notas[materia] !== undefined && notas[materia] !== null) {
                    return notas[materia];
                }
                
                // Try normalized match (remove accents)
                const materiaNormalized = materia.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                const matchingKey = Object.keys(notas).find(k => {
                    const kNormalized = k.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                    return kNormalized.toUpperCase() === materiaNormalized.toUpperCase();
                });
                
                return matchingKey ? notas[matchingKey] : undefined;
            };
            
            const tabContainer = document.getElementById('notas-t-content-wrapper');
            if (!tabContainer) {
                console.error('[renderTabNotasTeoricas] Container não encontrado');
                return;
            }

            // === EMPTY STATE - INCOR PROFESSIONAL === //
            if (!notas || typeof notas !== 'object' || Object.keys(notas).length === 0) {
                tabContainer.innerHTML = `
                    <div class="nt-empty-state">
                        <svg class="nt-empty-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                        </svg>
                        <div>
                            <h3 class="nt-empty-title">Nenhuma Avaliação Teórica Registrada</h3>
                            <p class="nt-empty-description">
                                As notas teóricas serão exibidas quando as avaliações dos módulos forem concluídas.
                            </p>
                            <div class="nt-empty-badge">
                                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5" />
                                </svg>
                                Sistema Acadêmico InCor
                            </div>
                        </div>
                    </div>
                `;
                return;
            }

            // === DEFINIÇÃO DOS GRUPOS DE MÓDULOS - INCOR === //
            // Disciplinas com seus pares substitutivos (Sub/) - a nota Sub substitui a original APENAS se for maior
            const mediaGroups = {
                'Fisioterapia I': {
                    // Formato: { nome, subKey } onde subKey é a chave da nota substitutiva
                    materias: [
                        { nome: 'Anatomopatologia', subKey: 'Sub/Anatomopatologia' },
                        { nome: 'Bases', subKey: 'Sub/Bases' },
                        { nome: 'Doenças Pulmonares', subKey: null },
                        { nome: 'Doenças Cardíacas', subKey: null },
                        { nome: 'Proc. Cirurgico', subKey: null },
                        { nome: 'Avaliação', subKey: 'Sub/Avaliacao' },
                        { nome: 'VM', subKey: 'Sub/VM' }
                    ],
                    icon: 'M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25',
                    color: '#0054B4' // InCor Blue
                },
                'Fisioterapia II': {
                    materias: [
                        { nome: 'Técnicas e Recursos', subKey: null },
                        { nome: 'Diag. Imagem', subKey: null }
                    ],
                    icon: 'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
                    color: '#0891B2' // Cyan
                },
                'Fisioterapia III': {
                    materias: [
                        { nome: 'Fisio aplicada', subKey: null },
                        { nome: 'UTI', subKey: null }
                    ],
                    icon: 'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z',
                    color: '#E21E26' // InCor Red
                },
                'Fisioterapia IV': {
                    materias: [
                        { nome: 'Pediatria', subKey: null },
                        { nome: 'Mobilização', subKey: null },
                        { nome: 'Reab. Pulmonar', subKey: null }
                    ],
                    icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z',
                    color: '#059669' // Green
                },
                'Disciplinas Complementares': {
                    materias: [
                        { nome: 'M. Cientifica', subKey: null },
                        { nome: 'Saúde e politicas', subKey: null },
                        { nome: 'Farmacoterapia', subKey: null },
                        { nome: 'Bioética', subKey: null }
                    ],
                    icon: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z',
                    color: '#6366F1' // Indigo
                }
            };
            
            // Helper function to get the effective grade considering substitutive grades
            // Substitutive grade replaces original ONLY if it's higher (always upward, never downward)
            const getEffectiveGrade = (materiaObj) => {
                const { nome, subKey } = materiaObj;
                const notaOriginal = parseNota(getNotaValue(nome));
                
                if (subKey) {
                    const notaSub = parseNota(getNotaValue(subKey));
                    // Use substitutive grade only if it exists (> 0) and is higher than original
                    if (notaSub > 0 && notaSub > notaOriginal) {
                        return { 
                            nota: notaSub, 
                            wasSubstituted: true, 
                            originalNota: notaOriginal,
                            subNota: notaSub 
                        };
                    }
                }
                
                return { 
                    nota: notaOriginal, 
                    wasSubstituted: false, 
                    originalNota: notaOriginal,
                    subNota: subKey ? parseNota(getNotaValue(subKey)) : 0
                };
            };
            
            // Helper function to determine grade color
            // Blue/Green for >= 7 (approved), Red/Warning for < 7
            const getGradeColor = (nota, defaultColor) => {
                if (nota <= 0) return defaultColor; // No grade
                if (nota >= 7) return '#10b981'; // Green - approved
                return '#ef4444'; // Red - needs improvement
            };

            // === CALCULAR MÉTRICAS GLOBAIS === //
            let totalSum = 0;
            let totalCount = 0;
            let highestGrade = 0;
            let lowestGrade = 10;

            // Processa todas as médias (chaves que contêm "MÉDIA" ou "MEDIA")
            const mediaKeys = Object.keys(notas).filter(k => {
                const keyUpper = k.toUpperCase();
                const keyNormalized = k.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
                return keyUpper.includes('MÉDIA') || keyNormalized.includes('MEDIA');
            });

            // Processa cada média encontrada
            mediaKeys.forEach(key => {
                const mediaValue = parseNota(notas[key]);
                if (mediaValue > 0) {
                    totalSum += mediaValue;
                    totalCount++;
                    highestGrade = Math.max(highestGrade, mediaValue);
                    lowestGrade = Math.min(lowestGrade, mediaValue);
                }
            });

            // Verifica se há alguma nota individual nos grupos (using new structure with effective grades)
            const hasIndividualGrades = Object.entries(mediaGroups).some(([groupName, group]) => 
                group.materias.some(materiaObj => {
                    const gradeInfo = getEffectiveGrade(materiaObj);
                    return gradeInfo.nota > 0;
                })
            );

            // Se não há médias NEM notas individuais, mostra mensagem
            if (mediaKeys.length === 0 && !hasIndividualGrades) {
                tabContainer.innerHTML = `
                    <div class="nt-empty-state">
                        <svg class="nt-empty-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <div>
                            <h3 class="nt-empty-title">Dados em Processamento</h3>
                            <p class="nt-empty-description">
                                Nenhuma nota ou média encontrada neste registro. Os dados podem estar sendo processados.
                            </p>
                        </div>
                    </div>
                `;
                return;
            }

            const overallAvg = totalCount > 0 ? totalSum / totalCount : 0;
            const progressPercent = overallAvg * 10;

            // Determina a mensagem de performance
            let performanceMessage = 'Precisa de atenção';
            if (overallAvg >= 9.0) {
                performanceMessage = 'Excelência Acadêmica';
            } else if (overallAvg >= 8.0) {
                performanceMessage = 'Muito Bom';
            } else if (overallAvg >= 7.0) {
                performanceMessage = 'Bom Desempenho';
            }

            // === HERO SECTION - INCOR BLUE === //
            let heroHtml = `
                <div class="nt-hero-section">
                    <div class="nt-hero-content">
                        <h1 class="nt-hero-title">Avaliações Teóricas</h1>
                        <p class="nt-hero-subtitle">
                            Desempenho nos módulos teóricos do Programa de Fisioterapia
                        </p>
                        <div class="nt-validation-badge">
                            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5" />
                            </svg>
                            ${totalCount > 0 ? `${totalCount} Módulo${totalCount > 1 ? 's' : ''} Avaliado${totalCount > 1 ? 's' : ''}` : 'Dados Disponíveis'}
                        </div>
                    </div>
                </div>
            `;

            // === DASHBOARD PRINCIPAL === //
            let dashboardHtml = `
                <div class="nt-dashboard-grid">
                    <div class="nt-progress-masterpiece">
                        <div class="nt-progress-content">
                            <div class="nt-ring-container">
                                <div class="nt-progress-ring" style="--nt-progress-percent: ${progressPercent}%;">
                                    <div class="nt-ring-value">${formatarNota(overallAvg)}</div>
                                    <div class="nt-ring-subtitle">de 10,0</div>
                                </div>
                            </div>
                            <div class="nt-progress-text">
                                <h2 class="nt-progress-title">Média Geral</h2>
                                <p class="nt-progress-description">${performanceMessage}</p>
                                <div class="nt-progress-meta">
                                    <svg class="nt-progress-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                        <path stroke-linecap="round" stroke-linejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                    </svg>
                                    <span class="nt-progress-stats">
                                        ${totalCount > 0 ? `Baseado em <strong>${totalCount}</strong> módulo${totalCount > 1 ? 's' : ''}` : 'Calculando...'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="nt-stats-grid">
                        <div class="nt-stat-card">
                            <div class="nt-stat-icon" style="background: linear-gradient(135deg, #059669, #10b981);">
                                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                                </svg>
                            </div>
                            <div>
                                <div class="nt-stat-value">${highestGrade > 0 ? formatarNota(highestGrade) : '-'}</div>
                                <div class="nt-stat-label">Maior Nota</div>
                            </div>
                        </div>
                        <div class="nt-stat-card">
                            <div class="nt-stat-icon" style="background: linear-gradient(135deg, #f59e0b, #d97706);">
                                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
                                </svg>
                            </div>
                            <div>
                                <div class="nt-stat-value">${lowestGrade < 10 && lowestGrade > 0 ? formatarNota(lowestGrade) : '-'}</div>
                                <div class="nt-stat-label">Menor Nota</div>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            // === SECTION HEADER === //
            let sectionHeaderHtml = `
                <div class="nt-section-header">
                    <h3>Módulos Teóricos</h3>
                    <p>Desempenho por módulo e disciplina</p>
                </div>
            `;

            // === MÓDULOS TEÓRICOS === //
            let modulesHtml = '<div class="nt-modules-grid">';

            Object.entries(mediaGroups).forEach(([groupName, groupData]) => {
                const { materias, icon, color } = groupData;
                
                // Calculate group average using effective grades (with substitution logic)
                // Only count disciplines with valid numeric grades (exclude blanks)
                let sum = 0;
                let count = 0;
                materias.forEach(materiaObj => {
                    const gradeInfo = getEffectiveGrade(materiaObj);
                    if (gradeInfo.nota > 0) {
                        sum += gradeInfo.nota;
                        count++;
                    }
                });
                const mediaValue = count > 0 ? sum / count : 0;

                // Process disciplines with substitution logic
                let disciplinasHtml = '';
                const disciplineCount = materias.length;
                const hasDetails = disciplineCount > 0;
                
                materias.forEach(materiaObj => {
                    const gradeInfo = getEffectiveGrade(materiaObj);
                    const notaMateria = gradeInfo.nota;
                    const isValidNota = notaMateria > 0;
                    const percentage = isValidNota ? (notaMateria / 10) * 100 : 0;
                    const displayValue = isValidNota ? formatarNota(notaMateria) : '-';
                    
                    // Determine color based on grade (>= 7 is blue/green, < 7 is red/warning)
                    const gradeColor = getGradeColor(notaMateria, color);
                    
                    // Build substitution indicator if applicable
                    let subIndicator = '';
                    if (gradeInfo.wasSubstituted) {
                        subIndicator = ` <span class="nt-sub-indicator" title="Nota substituída de ${formatarNota(gradeInfo.originalNota)} para ${formatarNota(gradeInfo.subNota)}">↑ Sub</span>`;
                    } else if (materiaObj.subKey && gradeInfo.subNota > 0 && gradeInfo.subNota <= gradeInfo.originalNota) {
                        // Has Sub grade but it wasn't used (original was higher or equal)
                        subIndicator = ` <span class="nt-sub-indicator nt-sub-kept-original" title="Nota Sub (${formatarNota(gradeInfo.subNota)}) não aplicada pois original é maior ou igual">✓ Original</span>`;
                    }
                    
                    disciplinasHtml += `
                        <div class="nt-discipline-item" style="--nt-discipline-color: ${gradeColor};">
                            <div class="nt-discipline-header">
                                <span class="nt-discipline-name">${materiaObj.nome}${subIndicator}</span>
                                <span class="nt-discipline-value" style="color: ${gradeColor};">${displayValue}</span>
                            </div>
                            <div class="nt-discipline-progress">
                                <div class="nt-discipline-fill" style="width: ${percentage}%; background: ${gradeColor};"></div>
                            </div>
                        </div>
                    `;
                });

                // Always show the card (show all disciplines even if average is 0)
                const percentage = (mediaValue / 10) * 100;
                const mediaColor = getGradeColor(mediaValue, color);
                
                modulesHtml += `
                    <div class="nt-module-card" style="--nt-module-color: ${color};">
                        <div class="nt-module-header">
                            <div class="nt-module-icon" style="background: linear-gradient(135deg, ${color}, ${color}cc);">
                                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="${icon}" />
                                    </svg>
                                </div>
                                <div class="nt-module-title-group">
                                    <h4 class="nt-module-title">${groupName}</h4>
                                    <p class="nt-module-subtitle">${disciplineCount} disciplina${disciplineCount > 1 ? 's' : ''}</p>
                                </div>
                                <div class="nt-module-grade">
                                    <div class="nt-grade-value" style="color: ${mediaColor};">${mediaValue > 0 ? formatarNota(mediaValue) : '-'}</div>
                                    <div class="nt-grade-label">Média</div>
                                </div>
                            </div>
                            
                            ${hasDetails ? `
                                <div class="nt-module-progress-bar">
                                    <div class="nt-module-progress-fill" style="width: ${percentage}%; background: ${mediaColor};"></div>
                                </div>
                                
                                <details class="nt-module-details" open>
                                    <summary class="nt-details-toggle">
                                        <span>Ver disciplinas</span>
                                        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                                            <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
                                        </svg>
                                    </summary>
                                    <div class="nt-details-content">
                                        ${disciplinasHtml}
                                    </div>
                                </details>
                            ` : ''}
                        </div>
                    `;
            });

            modulesHtml += '</div>';

            // === MONTAGEM FINAL === //
            tabContainer.innerHTML = heroHtml + dashboardHtml + sectionHeaderHtml + modulesHtml;
        }

        function calculatePracticeSummary(notasP) {
            console.log('[calculatePracticeSummary] Calculating with', notasP ? notasP.length : 0, 'evaluations');
            
            let overallSum = 0;
            let overallCount = 0;
            const last5Notes = [];
            
            const sortedNotasP = [...notasP].sort((a, b) => {
                const dateA = a['Data/Hora'] ? new Date(String(a['Data/Hora']).replace(/-/g,'/')) : new Date(0);
                const dateB = b['Data/Hora'] ? new Date(String(b['Data/Hora']).replace(/-/g,'/')) : new Date(0);
                return dateA - dateB; 
            });
            
            sortedNotasP.forEach((n, index) => {
                // Find the average/media field
                const kM = Object.keys(n).find(k => 
                    /MÉDIA.*NOTA.*FINAL/i.test(k) || 
                    /MEDIA.*NOTA.*FINAL/i.test(k) ||
                    /MÉDIA.*FINAL/i.test(k) ||
                    /MEDIA.*FINAL/i.test(k) ||
                    /NOTA.*FINAL/i.test(k)
                ) || null;
                
                const media = parseNota(n[kM]);
                
                if (media >= 0 && !isNaN(media)) {
                    overallSum += media;
                    overallCount++;
                    last5Notes.push({ label: n.nomePratica, value: media });
                }
            });
            
            const result = {
                overallAvg: overallCount > 0 ? (overallSum / overallCount) : 0,
                last5Notes: last5Notes.slice(-5)
            };
            
            console.log('[calculatePracticeSummary] Results:', {
                overallAvg: formatarNota(result.overallAvg, 2),
                evolutionPoints: result.last5Notes.length
            });
            
            return result;
        }


        /**
         * [MASTERPIECE v35] Renderiza a aba de Notas Práticas com design profissional InCor
         * Versão v35 - Professional InCor Edition - Matching Notas Teóricas Design
         */
        function renderTabNotasPraticas(notasP) {
            console.log("[renderTabNotasPraticas v35 - Professional InCor] Dados recebidos:", notasP);
            const tabContainer = document.getElementById('tab-notas-p');
            
            // === EMPTY STATE - INCOR PROFESSIONAL === //
            if (!notasP || notasP.length === 0) {
                tabContainer.innerHTML = `
                    <div class="np-empty-state-pro">
                        <svg class="np-empty-icon-pro" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                        </svg>
                        <div>
                            <h3 class="np-empty-title-pro">Nenhuma Avaliação Prática Registrada</h3>
                            <p class="np-empty-description-pro">
                                As avaliações práticas serão exibidas quando os supervisores concluírem os formulários de avaliação.
                            </p>
                            <div class="np-empty-badge-pro">
                                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5" />
                                </svg>
                                Sistema Acadêmico InCor
                            </div>
                        </div>
                    </div>
                `;
                return;
            }
            
            // === CÁLCULO E PREPARAÇÃO DOS DADOS === //
            const summary = calculatePracticeSummary(notasP);
            const hasValidatedData = notasP.some(n => n._uniqueId);
            const totalValidated = hasValidatedData ? notasP.filter(n => n._uniqueId).length : 0;
            const progressPercent = summary.overallAvg * 10;
            
            // Calcula estatísticas adicionais
            let highestGrade = 0;
            let lowestGrade = 10;
            let totalCount = 0;
            
            notasP.forEach(n => {
                const keyM = Object.keys(n).find(k => 
                    /MÉDIA.*NOTA.*FINAL/i.test(k) || 
                    /MEDIA.*NOTA.*FINAL/i.test(k) ||
                    /MÉDIA.*FINAL/i.test(k) ||
                    /MEDIA.*FINAL/i.test(k) ||
                    /NOTA.*FINAL/i.test(k)
                ) || null;
                const nota = parseNota(n[keyM]);
                if (nota > 0) {
                    totalCount++;
                    highestGrade = Math.max(highestGrade, nota);
                    lowestGrade = Math.min(lowestGrade, nota);
                }
            });
            
            if (lowestGrade === 10 && totalCount === 0) lowestGrade = 0;
            
            // Determina a mensagem de performance
            let performanceMessage = 'Precisa de atenção';
            if (summary.overallAvg >= 9.0) {
                performanceMessage = 'Excelência Acadêmica';
            } else if (summary.overallAvg >= 8.0) {
                performanceMessage = 'Muito Bom';
            } else if (summary.overallAvg >= 7.0) {
                performanceMessage = 'Bom Desempenho';
            }
            
            // Calcula tendência
            const hasTrend = summary.last5Notes.length >= 2;
            const isTrendingUp = hasTrend && summary.last5Notes[summary.last5Notes.length - 1].value > summary.last5Notes[0].value;
            
            // === HERO SECTION - INCOR CYAN (Prática) === //
            let heroHtml = `
                <div class="np-hero-section-pro">
                    <div class="np-hero-content-pro">
                        <h1 class="np-hero-title-pro">Avaliações Práticas</h1>
                        <p class="np-hero-subtitle-pro">
                            Desempenho nas atividades práticas do Programa de Fisioterapia
                        </p>
                        <div class="np-validation-badge-pro">
                            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                            </svg>
                            ${totalCount > 0 ? `${totalCount} Avaliação${totalCount > 1 ? 'ões' : ''} Prática${totalCount > 1 ? 's' : ''}` : 'Dados Disponíveis'}
                        </div>
                    </div>
                </div>
            `;
            
            // === DASHBOARD PRINCIPAL - Matching Notas Teóricas Layout === //
            let dashboardHtml = `
                <div class="np-dashboard-grid-pro">
                    <div class="np-progress-masterpiece-pro">
                        <div class="np-progress-content-pro">
                            <div class="np-ring-container-pro">
                                <div class="np-progress-ring-pro" style="--np-progress-percent: ${progressPercent}%;">
                                    <div class="np-ring-value-pro">${formatarNota(summary.overallAvg)}</div>
                                    <div class="np-ring-subtitle-pro">de 10,0</div>
                                </div>
                            </div>
                            <div class="np-progress-text-pro">
                                <h2 class="np-progress-title-pro">Média Geral</h2>
                                <p class="np-progress-description-pro">${performanceMessage}</p>
                                <div class="np-progress-meta-pro">
                                    <svg class="np-progress-icon-pro" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                        <path stroke-linecap="round" stroke-linejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                    </svg>
                                    <span class="np-progress-stats-pro">
                                        ${totalCount > 0 ? `Baseado em <strong>${totalCount}</strong> avaliação${totalCount > 1 ? 'ões' : ''}` : 'Calculando...'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="np-stats-grid-pro">
                        <div class="np-stat-card-pro">
                            <div class="np-stat-icon-pro" style="background: linear-gradient(135deg, #059669, #10b981);">
                                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                                </svg>
                            </div>
                            <div>
                                <div class="np-stat-value-pro">${highestGrade > 0 ? formatarNota(highestGrade) : '-'}</div>
                                <div class="np-stat-label-pro">Maior Nota</div>
                            </div>
                        </div>
                        <div class="np-stat-card-pro">
                            <div class="np-stat-icon-pro" style="background: linear-gradient(135deg, #f59e0b, #d97706);">
                                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
                                </svg>
                            </div>
                            <div>
                                <div class="np-stat-value-pro">${lowestGrade < 10 && lowestGrade > 0 ? formatarNota(lowestGrade) : '-'}</div>
                                <div class="np-stat-label-pro">Menor Nota</div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            
            // === SECTION HEADER - Evolução === //
            let evolutionHeaderHtml = `
                <div class="np-section-header-pro">
                    <h3>Evolução de Desempenho</h3>
                    <p>Acompanhamento das últimas avaliações práticas</p>
                </div>
            `;
            
            // === EVOLUTION CHART - Professional Style === //
            let evolutionHtml = `
                <div class="np-evolution-card-pro">
                    <div class="np-evolution-header-pro">
                        <div class="np-evolution-title-group-pro">
                            <div class="np-evolution-icon-pro">
                                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                                </svg>
                            </div>
                            <div>
                                <h4 class="np-evolution-card-title-pro">Gráfico de Evolução</h4>
                                <span class="np-evolution-card-subtitle-pro">Últimas ${summary.last5Notes.length || 5} avaliações</span>
                            </div>
                        </div>
                        ${hasTrend ? `
                            <div class="np-trend-badge-pro ${isTrendingUp ? 'np-trend-up' : 'np-trend-stable'}">
                                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                                    ${isTrendingUp 
                                        ? '<path stroke-linecap="round" stroke-linejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />'
                                        : '<path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14" />'
                                    }
                                </svg>
                                ${isTrendingUp ? 'Tendência Crescente' : 'Tendência Estável'}
                            </div>
                        ` : ''}
                    </div>
                    <div class="np-chart-canvas-pro">
                        ${summary.last5Notes.length > 0 ? summary.last5Notes.map((note, i) => {
                            let barColor = '#0891B2';
                            if (note.value >= 9) barColor = '#059669';
                            else if (note.value >= 7) barColor = '#0891B2';
                            else if (note.value < 7) barColor = '#f59e0b';
                            return `
                            <div class="np-chart-bar-pro">
                                <div class="np-bar-fill-pro" style="height: ${Math.max(note.value * 22, 35)}px; background: linear-gradient(180deg, ${barColor}, ${barColor}dd);">
                                    <div class="np-bar-value-pro">${formatarNota(note.value)}</div>
                                </div>
                                <div class="np-bar-label-pro">${note.label && note.label.length > 15 ? note.label.substring(0, 15) + '...' : (note.label || `Aval. ${i+1}`)}</div>
                            </div>
                        `;}).join('') : `
                            <div class="np-chart-empty-pro">
                                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75z" />
                                </svg>
                                <p>Dados insuficientes para exibir evolução</p>
                            </div>
                        `}
                    </div>
                </div>
            `;

            // === NAVEGAÇÃO DE AVALIAÇÕES DETALHADAS === //
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
                
                // Cria um label melhor para o botão
                let buttonLabel = n.nomePratica || `Avaliação ${index + 1}`;
                const moduleMatch = buttonLabel.match(/modulo\s*(\d+)/i) || buttonLabel.match(/np[_-]?(\d+)/i);
                const moduleNumber = moduleMatch ? parseInt(moduleMatch[1]) : null;
                
                if (n['Data/Hora']) {
                    try {
                        const dataObj = new Date(String(n['Data/Hora']).replace(/-/g,'/'));
                        const dataFormatadaCurta = dataObj.toLocaleDateString('pt-BR', { 
                            day: '2-digit', 
                            month: '2-digit',
                            timeZone: 'UTC' 
                        });
                        
                        if (moduleNumber) {
                            buttonLabel = `Módulo ${String(moduleNumber).padStart(2, '0')} - ${dataFormatadaCurta}`;
                        } else {
                            const supervisor = n.Supervisor ? ` (${n.Supervisor.split(' ')[0]})` : '';
                            buttonLabel = `Avaliação ${index + 1} - ${dataFormatadaCurta}${supervisor}`;
                        }
                    } catch (e) {
                        console.warn('[renderTabNotasPraticas] Erro ao formatar data do botão:', e);
                    }
                }
                
                navHtml += `<button class="np-tab-button ${isActive ? 'active' : ''}" data-subtab-id="${tabId}">${buttonLabel}</button>`;
                
                // Encontra campos importantes
                const keyM = Object.keys(n).find(k => 
                    /MÉDIA.*NOTA.*FINAL/i.test(k) || 
                    /MEDIA.*NOTA.*FINAL/i.test(k) ||
                    /MÉDIA.*FINAL/i.test(k) ||
                    /MEDIA.*FINAL/i.test(k) ||
                    /NOTA.*FINAL/i.test(k)
                ) || null;
                
                const keyC = Object.keys(n).find(k => 
                    /COMENTÁRIOS.*SUPERVISOR/i.test(k) ||
                    /COMENTARIOS.*SUPERVISOR/i.test(k) ||
                    /FEEDBACK.*SUPERVISOR/i.test(k) ||
                    /OBSERVAÇÕES/i.test(k) ||
                    /OBSERVACOES/i.test(k)
                ) || null;
                
                const mediaFinal = parseNota(n[keyM]);
                const comentario = n[keyC] || 'Sem comentários registrados.';
                const comentarioEscapado = comentario.replace(/'/g, "\\'").replace(/"/g, "&quot;").replace(/\n/g, "\\n");
                // Handle different variations of the date/time field
                const dataHoraValue = n['Data/Hora'] || n['DataHora'] || n.dataHora;
                const dataFormatada = dataHoraValue ? new Date(String(dataHoraValue).replace(/-/g,'/')).toLocaleDateString('pt-BR', {timeZone: 'UTC'}) : 'N/A';
                const nomePratica = formatarNomeModulo(n.nomePratica) || `Avaliação Prática ${index + 1}`;
                
                // Determina cor e status baseado na nota
                let gradeColor = '#3b82f6';
                let gradeStatus = 'Satisfatório';
                if (mediaFinal >= 9.0) {
                    gradeColor = '#10b981';
                    gradeStatus = 'Excelente';
                } else if (mediaFinal >= 8.0) {
                    gradeColor = '#6366f1';
                    gradeStatus = 'Muito Bom';
                } else if (mediaFinal >= 7.0) {
                    gradeColor = '#f59e0b';
                    gradeStatus = 'Bom';
                } else if (mediaFinal < 7.0) {
                    gradeColor = '#ef4444';
                    gradeStatus = 'Precisa Melhorar';
                }
                
                // Processa as notas numéricas e checklist
                let numericalScores = [];
                let checklistScores = [];
                
                Object.entries(n).forEach(([key, value]) => {
                    const isIgnored = /DATA\/HORA|DATAHORA|EMAILHC|NOMECOMPLETO|CURSO|SUPERVISOR|UNIDADE|PERIODO|TURNO|MÉDIA\s*\(NOTA FINAL\)|MÉDIA.*NOTA.*FINAL|MEDIA.*NOTA.*FINAL|MÉDIA.*FINAL|MEDIA.*FINAL|NOTA.*FINAL|MEDIANOTAFINAL|MediaNotaFinal|medianotafinal|COMENTÁRIOS\s*DO\(A\)\s*SUPERVISOR\(A\)|O SUPERVISOR ESTÁ CIENTE|NOMEPRATICA|_uniqueId|_sheetName|_validatedAt/i.test(key.toUpperCase().trim());
                    if (!isIgnored && value) {
                        let cleanKey = key;
                        const numericPrefixMatch = key.match(/^(\d+[\.,]?\d*)\s+(.+)$/);
                        if (numericPrefixMatch) {
                            const scoreFromPrefix = parseNota(numericPrefixMatch[1]);
                            const fieldNameFromSuffix = numericPrefixMatch[2];
                            if (scoreFromPrefix >= 0 && !isNaN(scoreFromPrefix)) {
                                numericalScores.push({ label: fieldNameFromSuffix.replace(/:/g, ''), value: scoreFromPrefix });
                                return;
                            }
                            cleanKey = fieldNameFromSuffix;
                        }
                        
                        const parsedValue = parseNota(value);
                        if (!isNaN(parsedValue) && parsedValue >= 0 && String(value).trim().match(/^[\d,.]+$/)) {
                            numericalScores.push({ label: cleanKey.replace(/:/g, ''), value: parsedValue });
                        } else if (String(value).trim() !== '' && String(value).trim() !== '0') {
                            checklistScores.push({ label: cleanKey.replace(/:/g, ''), value: value });
                        }
                    }
                });
                numericalScores.sort((a, b) => b.value - a.value);
                
                // === CARD DE AVALIAÇÃO - PROFESSIONAL INCOR DESIGN === //
                contentHtml += `
                    <div id="${tabId}" class="sub-tab-content ${isActive ? 'active' : ''}">
                        <div class="np-module-card-pro" style="--np-module-color: ${gradeColor};">
                            <div class="np-module-header-pro">
                                <div class="np-module-icon-pro" style="background: linear-gradient(135deg, ${gradeColor}, ${gradeColor}cc);">
                                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                        <path stroke-linecap="round" stroke-linejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                                    </svg>
                                </div>
                                <div class="np-module-title-group-pro">
                                    <h4 class="np-module-title-pro">${nomePratica}</h4>
                                    <p class="np-module-subtitle-pro">${n.Supervisor ? `Supervisor: ${n.Supervisor}` : ''} ${dataFormatada !== 'N/A' ? `• ${dataFormatada}` : ''}</p>
                                </div>
                                <div class="np-module-grade-pro">
                                    <div class="np-grade-value-pro" style="color: ${gradeColor};">${mediaFinal > 0 ? formatarNota(mediaFinal) : '-'}</div>
                                    <div class="np-grade-label-pro">${gradeStatus}</div>
                                </div>
                            </div>
                            
                            <div class="np-module-progress-bar-pro">
                                <div class="np-module-progress-fill-pro" style="width: ${(mediaFinal / 10) * 100}%; background: ${gradeColor};"></div>
                            </div>
                            
                            <details class="np-module-details-pro" open>
                                <summary class="np-details-toggle-pro">
                                    <span>Ver detalhes da avaliação</span>
                                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                                        <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
                                    </svg>
                                </summary>
                                <div class="np-details-content-pro">
                                    <!-- Metadata da avaliação -->
                                    <div class="np-eval-metadata-pro">
                                        <div class="np-meta-item-pro">
                                            <span class="np-meta-label">Supervisor</span>
                                            <span class="np-meta-value">${n.Supervisor || 'N/A'}</span>
                                        </div>
                                        <div class="np-meta-item-pro">
                                            <span class="np-meta-label">Data</span>
                                            <span class="np-meta-value">${dataFormatada}</span>
                                        </div>
                                        <div class="np-meta-item-pro">
                                            <span class="np-meta-label">Unidade</span>
                                            <span class="np-meta-value">${n.Unidade || 'N/A'}</span>
                                        </div>
                                        <div class="np-meta-item-pro">
                                            <span class="np-meta-label">Período</span>
                                            <span class="np-meta-value">${n.Periodo || 'N/A'}</span>
                                        </div>
                                    </div>
                                    
                                    <!-- Competências numéricas -->
                                    ${numericalScores.length > 0 ? `
                                        <div class="np-competencies-section-pro">
                                            <div class="np-competencies-header-pro">
                                                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                                    <path stroke-linecap="round" stroke-linejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                                </svg>
                                                <span>Desempenho por Competência</span>
                                            </div>
                                            ${numericalScores.map(score => {
                                                const percentage = (score.value / 10) * 100;
                                                let scoreColor = '#0891B2';
                                                if (score.value >= 9) scoreColor = '#059669';
                                                else if (score.value >= 7) scoreColor = '#0891B2';
                                                else if (score.value < 7) scoreColor = '#f59e0b';
                                                
                                                const displayLabel = splitConcatenatedFieldName(score.label);
                                                return `
                                                    <div class="np-discipline-item-pro" style="--np-discipline-color: ${scoreColor};">
                                                        <div class="np-discipline-header-pro">
                                                            <span class="np-discipline-name-pro" title="${score.label}">${displayLabel}</span>
                                                            <span class="np-discipline-value-pro" style="color: ${scoreColor};">${formatarNota(score.value)}</span>
                                                        </div>
                                                        <div class="np-discipline-progress-pro">
                                                            <div class="np-discipline-fill-pro" style="width: ${percentage}%; background: ${scoreColor};"></div>
                                                        </div>
                                                    </div>
                                                `;
                                            }).join('')}
                                        </div>
                                    ` : ''}
                                    
                                    <!-- Checklist de habilidades -->
                                    ${checklistScores.length > 0 ? `
                                        <div class="np-checklist-section-pro">
                                            <div class="np-checklist-header-pro">
                                                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                                    <path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                                                </svg>
                                                <span>Checklist de Habilidades</span>
                                            </div>
                                            <div class="np-checklist-grid-pro">
                                                ${checklistScores.map(skill => {
                                                    const displayLabel = splitConcatenatedFieldName(skill.label);
                                                    return `
                                                    <div class="np-checklist-item-pro">
                                                        <span class="np-checklist-label-pro" title="${skill.label}">${displayLabel}</span>
                                                        <span class="np-checklist-value-pro" title="${skill.value}">${skill.value}</span>
                                                    </div>
                                                `;}).join('')}
                                            </div>
                                        </div>
                                    ` : ''}
                                    
                                    <!-- Feedback do supervisor -->
                                    <div class="np-feedback-section-pro">
                                        <div class="np-feedback-header-pro">
                                            <div class="np-feedback-title-pro">
                                                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                                    <path stroke-linecap="round" stroke-linejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                                                </svg>
                                                <span>Feedback do Supervisor</span>
                                            </div>
                                            <button class="np-analyze-btn-pro gemini-analysis-button" data-loading="false" data-comment="${comentarioEscapado}">
                                                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                                    <path stroke-linecap="round" stroke-linejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                                                </svg>
                                                Analisar com IA
                                            </button>
                                        </div>
                                        <div class="np-feedback-content-pro">${comentario}</div>
                                    </div>
                                    
                                    ${n._uniqueId ? `
                                        <div class="np-validation-info-pro">
                                            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                                                <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                            <div>
                                                <span class="np-validation-title-pro">Avaliação Validada</span>
                                                <span class="np-validation-id-pro">ID: ${n._uniqueId}</span>
                                            </div>
                                        </div>
                                    ` : ''}
                                </div>
                            </details>
                        </div>
                    </div>
                `;
            });

            // === MONTAGEM FINAL DO HTML - PROFESSIONAL INCOR DESIGN === //
            tabContainer.innerHTML = `
                ${heroHtml}
                ${dashboardHtml}
                ${evolutionHeaderHtml}
                ${evolutionHtml}
                <div class="np-section-header-pro">
                    <h3>Avaliações Detalhadas</h3>
                    <p>Histórico completo com análise profunda de cada avaliação prática</p>
                </div>
                <div class="np-modules-grid-pro">
                    <div class="np-tab-nav-pro">
                        ${navHtml}
                    </div>
                    <div id="student-detail-subnav-content" class="np-content-area-pro">
                        ${contentHtml}
                    </div>
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
            console.log("DOM Carregado. Aguardando Firebase SDK...");
            
            // CRITICAL FIX: Disable login button until Firebase is ready
            const loginButton = document.getElementById('login-button');
            if (loginButton) {
                loginButton.disabled = true;
                loginButton.textContent = 'Aguarde...';
                console.log('[Firebase] Login button disabled - waiting for Firebase SDK');
            }
            
            // Timeout reference for cleanup
            let loginButtonTimeout = null;
            
            // Helper function to enable login button and clear timeout
            const enableLoginButton = (reason) => {
                const btn = document.getElementById('login-button');
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = 'Entrar';
                    console.log(`[Firebase] Login button enabled - ${reason}`);
                }
                if (loginButtonTimeout) {
                    clearTimeout(loginButtonTimeout);
                    loginButtonTimeout = null;
                }
            };
            
            // CRITICAL FIX: Ensure login button is enabled after max 5 seconds
            // This prevents users from being stuck if Firebase is slow or blocked
            loginButtonTimeout = setTimeout(() => {
                const btn = document.getElementById('login-button');
                if (btn && btn.disabled) {
                    enableLoginButton('timeout (5s), Firebase may still be loading');
                }
            }, 5000);
            
            // Setup event handlers first
            setupEventHandlers();
            
            // Function to initialize app once Firebase is ready
            const initializeApp = () => {
                console.log("Inicializando Firebase e configurando autenticação.");
                
                // Initialize Firebase
                const firebaseReady = initializeFirebase();
                if (!firebaseReady) {
                    console.error('Falha ao inicializar Firebase. Verifique se:');
                    console.error('1. Sua conexão com a internet está funcionando');
                    console.error('2. O arquivo firebase-config.js tem as configurações corretas');
                    console.error('3. Os scripts do Firebase SDK carregaram corretamente');
                    console.error('Mostrando tela de login, mas o login não funcionará até que Firebase seja inicializado.');
                    showView('login-view');
                    
                    // Enable login button even on Firebase failure
                    enableLoginButton('despite Firebase initialization failure');
                    
                    showError('Firebase falhou ao inicializar. Por favor, recarregue a página. Se o problema persistir, verifique sua conexão.', false);
                    return;
                }
                
                // CRITICAL FIX: Enable login button now that Firebase is ready
                enableLoginButton('Firebase is ready');
                
                // Setup Firebase Authentication State Observer
                // This is the new entry point for the application
                window.firebase.onAuthStateChanged(fbAuth, (user) => {
                    if (user) {
                        // User is signed in
                        console.log('[onAuthStateChanged] Usuário autenticado:', user.email);
                        
                        // Update user menu with logged-in user info
                        updateUserMenuInfo(user);
                        
                        // CRITICAL FIX: Always show dashboard-view (never student-detail-view)
                        // This ensures that after login, the user always lands on the dashboard
                        showView('dashboard-view');
                        initDashboard();
                    } else {
                        // User is signed out
                        console.log('[onAuthStateChanged] Usuário não autenticado. Mostrando login.');
                        
                        // Clean up: cancel all database listeners
                        cancelAllDatabaseListeners();
                        
                        // Clean up: clear appState
                        appState.alunos = [];
                        appState.alunosMap.clear();
                        appState.escalas = {};
                        appState.ausenciasReposicoes = [];
                        appState.notasTeoricas = {};
                        appState.notasPraticas = {};
                        appState.pontoStaticRows = [];
                        
                        // CRITICAL FIX: Always show login view when not authenticated
                        // This ensures the app never gets stuck on a student detail page when logged out
                        showLoading(false); // Ensure loading overlay is hidden
                        showView('login-view');
                    }
                });
            };
            
            // Wait for Firebase SDK to be ready
            if (window.firebase) {
                // Already loaded (unlikely in module context, but possible)
                initializeApp();
            } else {
                // Wait for firebaseReady event
                window.addEventListener('firebaseReady', initializeApp, { once: true });
                
                // Fallback timeout in case event doesn't fire
                setTimeout(() => {
                    if (!window.firebase) {
                        console.error('Timeout esperando Firebase SDK (3 segundos).');
                        console.error('Os scripts do Firebase podem estar bloqueados ou falhando ao carregar.');
                        console.error('Verifique:');
                        console.error('  - Sua conexão com a internet');
                        console.error('  - Se há bloqueadores de anúncios/scripts ativos');
                        console.error('  - O console de rede (Network tab) para erros de carregamento');
                        console.error('Tentando inicializar mesmo assim...');
                        
                        // Ensure login button is enabled even if Firebase SDK never loaded
                        const btn = document.getElementById('login-button');
                        if (btn && btn.disabled) {
                            enableLoginButton('force-enabled after SDK timeout');
                        }
                        
                        initializeApp();
                    }
                }, 3000);
            }
        });

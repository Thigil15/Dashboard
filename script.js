        // ====================================================================
        // FIREBASE INITIALIZATION
        // ====================================================================
        
        // Wait for window.firebase to be available (loaded by index.html)
        let fbApp, fbAuth, fbDB;
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
                console.log('[Firebase] Initialized successfully');
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
                }}
            ];
            
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
        
        /**
         * Trigger UI updates based on data changes
         */
        function triggerUIUpdates(stateKey) {
            // Only update if we're on the dashboard view
            const dashboardView = document.getElementById('dashboard-view');
            if (!dashboardView || dashboardView.style.display === 'none') {
                return;
            }
            
            console.log(`[triggerUIUpdates] Atualizando UI para: ${stateKey}`);
            
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
                case 'escalas':
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

// Field name variants for robust matching (handles different casing/formatting from Firebase)
const EMAIL_FIELD_VARIANTS = ['EmailHC', 'emailHC', 'emailhc', 'EMAILHC', 'Email', 'email'];
const NAME_FIELD_VARIANTS = ['NomeCompleto', 'nomeCompleto', 'nomecompleto', 'NOMECOMPLETO', 'Nome', 'nome'];

// Metadata/non-grade fields to exclude from grade calculations (uppercase for O(1) lookup)
const EXCLUDED_FIELDS_SET = new Set(['SERIALNUMBER', 'NOMECOMPLETO', 'EMAILHC', 'CURSO', 'EMAIL', 'NOME']);

// Helper function to get a value from an object using field name variants
function getFieldValue(obj, fieldVariants) {
    if (!obj || !fieldVariants) return null;
    const matchingField = fieldVariants.find(f => obj[f] !== undefined && obj[f] !== null);
    return matchingField ? obj[matchingField] : null;
}

const appState = {
    alunos: [],
    alunosMap: new Map(),
    pontoHojeMap: new Map(),
    pontoHojeAliases: new Map(),
    escalas: {},
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
         * Matches formats like: "7h às 12h", "08h as 13h", "8h a 14h - Escala 1"
         * Format: {hours}h [às|as|a] {hours}h [optional text]
         * Returns: { horaEntrada: "08:00", horaSaida: "13:00" } or null
         */
        function parseTimeFromScheduleValue(dateValue) {
            if (!dateValue || typeof dateValue !== 'string') return null;
            // Pattern: captures hour digits before and after separator (às/as/a)
            // Examples: "7h às 12h", "08h as 13h", "8h a 14h - Escala 1"
            const timeMatch = dateValue.match(/(\d{1,2})h\s*(?:às|as|a)?\s*(\d{1,2})h/i);
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
                return a ? { nomeEscala: e.nomeEscala, headersDay: e.headersDay, ...a } : null;
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
            if(appState.notasTeoricas?.registros){
                appState.notasTeoricas.registros.forEach(r => {
                    // Use helper function for robust field matching
                    const rEmail = getFieldValue(r, EMAIL_FIELD_VARIANTS);
                    const rEmailNorm = normalizeString(rEmail);
                    const rNome = getFieldValue(r, NAME_FIELD_VARIANTS);
                    const rNomeNorm = normalizeString(rNome);
                    
                    const student = activeStudentMap.get(rEmailNorm) || activeStudentMap.get(rNomeNorm);

                    if(student && student.Curso !== 'Residência - 2º ano' && student.Curso !== 'Residência  - 2º ano'){
                        Object.keys(r).forEach(k => {
                            // Exclude known non-grade fields (case-insensitive) using module-level Set
                            const kUpper = k.toUpperCase();
                            if(!EXCLUDED_FIELDS_SET.has(kUpper) && k.trim() !== ''){
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
            
            // Debug logging to understand data
            console.log('[renderModuleAverages] Received tAvgs:', tAvgs);
            console.log('[renderModuleAverages] Received pAvgs:', pAvgs);
            console.log('[renderModuleAverages] tAvgs keys:', Object.keys(tAvgs));
            console.log('[renderModuleAverages] pAvgs keys:', Object.keys(pAvgs));
            
            // Get counts for each module to show student count
            const tCounts = {};
            const pCounts = {};
            
            // Process theoretical data to get counts
            if (appState.notasTeoricas?.registros) {
                console.log('[renderModuleAverages] NotasTeoricas registros count:', appState.notasTeoricas.registros.length);
                if (appState.notasTeoricas.registros.length > 0) {
                    console.log('[renderModuleAverages] First record keys:', Object.keys(appState.notasTeoricas.registros[0]));
                }
                
                appState.notasTeoricas.registros.forEach(r => {
                    Object.keys(r).forEach(k => {
                        const kUpper = k.toUpperCase();
                        // Use module-level Set for O(1) lookup
                        if (!EXCLUDED_FIELDS_SET.has(kUpper) && k.trim() !== '') {
                            const n = parseNota(r[k]);
                            if (n > 0) {
                                tCounts[k] = (tCounts[k] || 0) + 1;
                            }
                        }
                    });
                });
            } else {
                console.warn('[renderModuleAverages] ⚠️ No theoretical records found in appState.notasTeoricas.registros');
            }
            
            // Process practical data to get counts
            if (appState.notasPraticas && typeof appState.notasPraticas === 'object') {
                console.log('[renderModuleAverages] NotasPraticas modules:', Object.keys(appState.notasPraticas));
                Object.values(appState.notasPraticas).forEach(p => {
                    const pNome = p.nomePratica;
                    if (p && p.registros) {
                        pCounts[pNome] = p.registros.length;
                    }
                });
            } else {
                console.warn('[renderModuleAverages] ⚠️ No practical grades found in appState.notasPraticas');
            }
            
            // Helper to extract module number from key for sorting
            const extractModuleNumber = (key) => {
                const match = key.match(/\d+/);
                return match ? parseInt(match[0], 10) : 999;
            };
            
            // Helper to normalize key for comparison (accent-insensitive, case-insensitive)
            const normalizeKey = (key) => {
                return key.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
            };
            
            // Separate MÉDIA entries (module averages) from individual discipline entries
            const mediaEntries = Object.entries(tAvgs)
                .filter(([key, value]) => {
                    const keyNorm = normalizeKey(key);
                    return (keyNorm.includes('MEDIA') || keyNorm.includes('MÉDIA')) && value > 0;
                })
                .map(([key, value]) => ({ key, value, sortNum: extractModuleNumber(key) }))
                .sort((a, b) => a.sortNum - b.sortNum);
            
            // Get individual discipline entries (not MÉDIA)
            const disciplineEntries = Object.entries(tAvgs)
                .filter(([key, value]) => {
                    const keyNorm = normalizeKey(key);
                    return !(keyNorm.includes('MEDIA') || keyNorm.includes('MÉDIA')) && value > 0;
                })
                .map(([key, value]) => ({ key, value }))
                .sort((a, b) => a.key.localeCompare(b.key));
            
            console.log('[renderModuleAverages] Module averages (MÉDIA):', mediaEntries.length);
            console.log('[renderModuleAverages] Individual disciplines:', disciplineEntries.length);
            
            // Filter and sort practical averages
            const practicalEntries = Object.entries(pAvgs)
                .filter(([_, value]) => value > 0)
                .map(([key, value]) => ({ key, value, sortNum: extractModuleNumber(key) }))
                .sort((a, b) => {
                    if (a.sortNum !== b.sortNum) return a.sortNum - b.sortNum;
                    return a.key.localeCompare(b.key);
                });
            
            // Calculate overall statistics for the header
            const theoreticalTotal = mediaEntries.length + disciplineEntries.length;
            const practicalTotal = practicalEntries.length;
            const avgTheoretical = mediaEntries.length > 0 
                ? (mediaEntries.reduce((sum, e) => sum + e.value, 0) / mediaEntries.length).toFixed(1)
                : (disciplineEntries.length > 0 
                    ? (disciplineEntries.reduce((sum, e) => sum + e.value, 0) / disciplineEntries.length).toFixed(1)
                    : 'N/A');
            const avgPractical = practicalEntries.length > 0 
                ? (practicalEntries.reduce((sum, e) => sum + e.value, 0) / practicalEntries.length).toFixed(1)
                : 'N/A';
            
            // Build theoretical section HTML
            let theoreticalHtml = '';
            const theoreticalEntries = mediaEntries.map(({ key, value }) => [key, value]);
            
            if (theoreticalEntries.length > 0 || disciplineEntries.length > 0) {
                theoreticalHtml = `
                    <div class="incor-modules-section-container">
                        <div class="incor-modules-section-header">
                            <div class="incor-modules-section-icon incor-modules-section-icon--theoretical">
                                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
                                </svg>
                            </div>
                            <div>
                                <h3 class="incor-modules-section-title">Notas Teóricas</h3>
                                <p class="incor-modules-section-subtitle">
                                    ${theoreticalEntries.length > 0 
                                        ? `${theoreticalEntries.length} módulo${theoreticalEntries.length > 1 ? 's' : ''} • Média geral: ${avgTheoretical}` 
                                        : `${disciplineEntries.length} disciplina${disciplineEntries.length > 1 ? 's' : ''} avaliada${disciplineEntries.length > 1 ? 's' : ''}`}
                                </p>
                            </div>
                        </div>
                        <div class="incor-modules-card-list">
                            ${theoreticalEntries.length > 0 ? theoreticalEntries.map(([key, value], index) => {
                                const moduleName = key.replace(/MÉDIA\s*/i, '').replace(/\s*FISIO/i, ' Fisio').trim() || 'Módulo Teórico';
                                const percentage = (value / 10) * 100;
                                const count = tCounts[key] || 0;
                                return `
                                    <div class="incor-module-card incor-module-card--theoretical">
                                        <div class="incor-module-card__info">
                                            <span class="incor-module-card__order">Módulo ${index + 1}</span>
                                            <span class="incor-module-card__name" title="${escapeHtml(moduleName)}">${escapeHtml(moduleName)}</span>
                                        </div>
                                        <div class="incor-module-card__meta">
                                            ${count > 0 ? `<span class="incor-module-card__count">${count} aluno${count > 1 ? 's' : ''}</span>` : ''}
                                            <div class="incor-module-card__grade">
                                                <span class="incor-module-card__value incor-module-card__value--theoretical">${value.toFixed(1)}</span>
                                                <span class="incor-module-card__max">de 10,0</span>
                                                <div class="incor-module-card__progress">
                                                    <div class="incor-module-card__progress-fill incor-module-card__progress-fill--theoretical" style="width: ${percentage}%;"></div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                `;
                            }).join('') : ''}
                            ${disciplineEntries.length > 0 && theoreticalEntries.length === 0 ? disciplineEntries.map(({ key, value }, index) => {
                                const percentage = (value / 10) * 100;
                                const count = tCounts[key] || 0;
                                return `
                                    <div class="incor-module-card incor-module-card--theoretical">
                                        <div class="incor-module-card__info">
                                            <span class="incor-module-card__order">Disciplina ${index + 1}</span>
                                            <span class="incor-module-card__name" title="${escapeHtml(key)}">${escapeHtml(key)}</span>
                                        </div>
                                        <div class="incor-module-card__meta">
                                            ${count > 0 ? `<span class="incor-module-card__count">${count} aluno${count > 1 ? 's' : ''}</span>` : ''}
                                            <div class="incor-module-card__grade">
                                                <span class="incor-module-card__value incor-module-card__value--theoretical">${value.toFixed(1)}</span>
                                                <span class="incor-module-card__max">de 10,0</span>
                                                <div class="incor-module-card__progress">
                                                    <div class="incor-module-card__progress-fill incor-module-card__progress-fill--theoretical" style="width: ${percentage}%;"></div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                `;
                            }).join('') : ''}
                            ${disciplineEntries.length > 0 && theoreticalEntries.length > 0 ? `
                                <details class="incor-modules-disciplines-details">
                                    <summary class="incor-modules-disciplines-summary">
                                        <span>Ver ${disciplineEntries.length} disciplina${disciplineEntries.length > 1 ? 's' : ''} individuai${disciplineEntries.length > 1 ? 's' : ''}</span>
                                        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                            <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
                                        </svg>
                                    </summary>
                                    <div class="incor-modules-disciplines-content">
                                        ${disciplineEntries.map(({ key, value }) => {
                                            const percentage = (value / 10) * 100;
                                            const count = tCounts[key] || 0;
                                            return `
                                                <div class="incor-discipline-item">
                                                    <span class="incor-discipline-name" title="${escapeHtml(key)}">${escapeHtml(key)}</span>
                                                    <div class="incor-discipline-grade">
                                                        ${count > 0 ? `<span class="incor-discipline-count">(${count})</span>` : ''}
                                                        <span class="incor-discipline-value">${value.toFixed(1)}</span>
                                                        <div class="incor-discipline-progress">
                                                            <div class="incor-discipline-fill" style="width: ${percentage}%;"></div>
                                                        </div>
                                                    </div>
                                                </div>
                                            `;
                                        }).join('')}
                                    </div>
                                </details>
                            ` : ''}
                        </div>
                    </div>
                `;
            } else {
                theoreticalHtml = `
                    <div class="incor-modules-section-container">
                        <div class="incor-modules-section-header">
                            <div class="incor-modules-section-icon incor-modules-section-icon--theoretical">
                                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
                                </svg>
                            </div>
                            <div>
                                <h3 class="incor-modules-section-title">Notas Teóricas</h3>
                                <p class="incor-modules-section-subtitle">Aguardando dados do Firebase</p>
                            </div>
                        </div>
                        <div class="incor-modules-empty">
                            <p>Nenhuma nota teórica disponível</p>
                            <p class="incor-modules-empty-hint">Os dados serão carregados automaticamente quando disponíveis</p>
                        </div>
                    </div>
                `;
            }
            
            // Build practical section HTML
            let practicalHtml = '';
            if (practicalEntries.length > 0) {
                practicalHtml = `
                    <div class="incor-modules-section-container">
                        <div class="incor-modules-section-header">
                            <div class="incor-modules-section-icon incor-modules-section-icon--practical">
                                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/>
                                </svg>
                            </div>
                            <div>
                                <h3 class="incor-modules-section-title">Notas Práticas</h3>
                                <p class="incor-modules-section-subtitle">${practicalEntries.length} módulo${practicalEntries.length > 1 ? 's' : ''} • Média geral: ${avgPractical}</p>
                            </div>
                        </div>
                        <div class="incor-modules-card-list">
                            ${practicalEntries.map(({ key, value }, index) => {
                                const percentage = (value / 10) * 100;
                                const count = pCounts[key] || 0;
                                // Format practical module name nicely
                                const moduleName = formatarNomeModulo(key) || key;
                                return `
                                    <div class="incor-module-card incor-module-card--practical">
                                        <div class="incor-module-card__info">
                                            <span class="incor-module-card__order">Prática ${index + 1}</span>
                                            <span class="incor-module-card__name" title="${escapeHtml(moduleName)}">${escapeHtml(moduleName)}</span>
                                        </div>
                                        <div class="incor-module-card__meta">
                                            ${count > 0 ? `<span class="incor-module-card__count">${count} avaliação${count > 1 ? 'ões' : ''}</span>` : ''}
                                            <div class="incor-module-card__grade">
                                                <span class="incor-module-card__value incor-module-card__value--practical">${value.toFixed(1)}</span>
                                                <span class="incor-module-card__max">de 10,0</span>
                                                <div class="incor-module-card__progress">
                                                    <div class="incor-module-card__progress-fill incor-module-card__progress-fill--practical" style="width: ${percentage}%;"></div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                `;
            } else {
                practicalHtml = `
                    <div class="incor-modules-section-container">
                        <div class="incor-modules-section-header">
                            <div class="incor-modules-section-icon incor-modules-section-icon--practical">
                                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/>
                                </svg>
                            </div>
                            <div>
                                <h3 class="incor-modules-section-title">Notas Práticas</h3>
                                <p class="incor-modules-section-subtitle">Aguardando dados do Firebase</p>
                            </div>
                        </div>
                        <div class="incor-modules-empty">
                            <p>Nenhuma nota prática disponível</p>
                            <p class="incor-modules-empty-hint">Os dados serão carregados automaticamente quando disponíveis</p>
                        </div>
                    </div>
                `;
            }
            
            container.innerHTML = theoreticalHtml + practicalHtml;
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
             
             // Find theory class days for this student
             const theoryDaysHtml = renderTheoryClassDays();
             
             p.innerHTML=`
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
                        <div class="student-info-item">
                            <dt class="student-info-label">CREFITO</dt>
                            <dd class="student-info-value">${info.Crefito||'N/A'}</dd>
                        </div>
                        <div class="student-info-item">
                            <dt class="student-info-label">Curso</dt>
                            <dd class="student-info-value">${info.Curso||'N/A'}</dd>
                        </div>
                    </dl>
                </div>
                
                ${theoryDaysHtml}
             `;
        }
        
        /**
         * Render theory class days section based on current scales
         * Shows the days when theory classes occur (Tuesdays and Thursdays)
         */
        function renderTheoryClassDays() {
            // Find all theory scales (EscalaTeoria1, EscalaTeoria2, etc.)
            const theoryScales = Object.entries(appState.escalas || {})
                .filter(([key, escala]) => escala.tipo === 'teoria')
                .sort((a, b) => a[1].numero - b[1].numero);
            
            if (theoryScales.length === 0) {
                // No theory scales found
                return '';
            }
            
            let theoryHtml = `
                <div class="student-info-section student-theory-section">
                    <h3 class="student-info-section-title">
                        <svg class="student-info-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                        </svg>
                        Aulas Teóricas
                        <span class="student-info-badge">Terças e Quintas</span>
                    </h3>
                    <p class="student-theory-description">Dias de aula teórica por período de escala</p>
                    
                    <div class="theory-scales-container">
            `;
            
            theoryScales.forEach(([key, escala]) => {
                const diasAula = escala.diasAula || [];
                
                theoryHtml += `
                    <div class="theory-scale-card">
                        <div class="theory-scale-header">
                            <span class="theory-scale-name">${escala.nomeEscala}</span>
                            <span class="theory-scale-count">${diasAula.length} dias</span>
                        </div>
                        <div class="theory-days-list">
                `;
                
                if (diasAula.length > 0) {
                    diasAula.forEach(dia => {
                        const isQuinta = dia.diaSemana === 'Quinta';
                        theoryHtml += `
                            <span class="theory-day-chip ${isQuinta ? 'quinta' : 'terca'}">
                                <span class="theory-day-name">${dia.diaSemana}</span>
                                <span class="theory-day-date">${dia.data}</span>
                            </span>
                        `;
                    });
                } else {
                    theoryHtml += `<span class="theory-no-days">Nenhum dia de aula encontrado</span>`;
                }
                
                theoryHtml += `
                        </div>
                    </div>
                `;
            });
            
            theoryHtml += `
                    </div>
                </div>
            `;
            
            return theoryHtml;
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
 * Retorna um objeto com: { hours: number, startTime: string, endTime: string, isPlantao: boolean }
 */
function _esc_calculateHours(rawText) {
    if (!rawText) return { hours: 0, startTime: '', endTime: '', isPlantao: false };
    const s = rawText.replace(/(\d{1,2})h(\d{2})?/g, '$1:$2').replace(/h/g, ':00'); 
    const regex = /(\d{1,2}):?(\d{0,2})\s*(-|às|as|a)\s*(\d{1,2}):?(\d{0,2})/i;
    const match = s.match(regex);

    if (!match) return { hours: 0, startTime: '', endTime: '', isPlantao: false }; 

    let h1 = parseInt(match[1], 10);
    let m1 = parseInt(match[2] || '0', 10);
    let h2 = parseInt(match[4], 10);
    let m2 = parseInt(match[5] || '0', 10);

    if (isNaN(h1) || isNaN(h2)) return { hours: 0, startTime: '', endTime: '', isPlantao: false };

    const d1 = new Date(2000, 0, 1, h1, m1);
    const d2 = new Date(2000, 0, 1, h2, m2);
    let diff = (d2.getTime() - d1.getTime()) / (1000 * 60 * 60);

    if (diff < 0) { diff += 24; }
    
    // Format times
    const startTime = `${String(h1).padStart(2, '0')}:${String(m1).padStart(2, '0')}`;
    const endTime = `${String(h2).padStart(2, '0')}:${String(m2).padStart(2, '0')}`;
    
    // Check if it's a plantão (12 hour shift, typically 07h-19h or 08h-20h, or 19h-07h)
    const isPlantao = diff >= 11 && diff <= 13; // 11-13 hour shifts are considered plantão
    
    return { hours: diff, startTime, endTime, isPlantao };
}

/**
 * [HELPER] Classifica o texto bruto da escala em uma chave de status.
 * Agora usa a informação de horas para detectar plantões automaticamente
 */
function _esc_normalizeStatusKey(raw, hoursInfo) {
    if (!raw || typeof raw !== 'string' || raw.trim() === '') return 'none';
    const s = normalizeString(raw);
    
    // Priority checks first
    if (s.includes('ausencia') || s.includes('falta')) return 'absent';
    if (s.includes('reposi') || s.includes('reposição')) return 'makeup';
    if (s.includes('folga') || s.includes('descanso')) return 'off';
    
    // Check if explicitly marked as "aula"
    if (s.includes('aula')) return 'aula'; // Azul
    
    // Check if it's a plantão based on hours (12h shifts)
    if (hoursInfo && hoursInfo.isPlantao) {
        return 'plantao'; // Roxo
    }
    
    // If has hours but not a plantão and not explicitly "aula", it's regular presence
    if (hoursInfo && hoursInfo.hours > 0) return 'presenca'; // Verde
    
    // Fallback: if has any text, assume presence
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
            const hoursInfo = _esc_calculateHours(rawText);
            const statusKey = _esc_normalizeStatusKey(rawText, hoursInfo);

            if (hoursInfo.hours === 0) return;

            if (statusKey !== 'off' && statusKey !== 'none') {
                totalDeveria += hoursInfo.hours;
            }
            if (statusKey !== 'off' && statusKey !== 'none') {
                const isAusente = absentDatesTotal.has(iso);
                const isReposto = makeupDatesTotal.has(iso);
                if (!isAusente || isReposto) {
                     totalFeitas += hoursInfo.hours;
                }
            } else if (statusKey === 'off' && makeupDatesTotal.has(iso)) {
                totalFeitas += hoursInfo.hours;
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
            const hoursInfo = _esc_calculateHours(rawText);
            let statusKey = _esc_normalizeStatusKey(rawText, hoursInfo);
            
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
                    const pontoStatus = _esc_normalizeStatusKey(rawText, hoursInfo);
                    statusKey = (pontoStatus === 'plantao' || pontoStatus === 'aula') ? pontoStatus : 'presenca';
                    const horaEntradaPonto = pontoRecord.HoraEntrada || pontoRecord.horaEntrada || '';
                    rawText = horaEntradaPonto ? `Presente (${horaEntradaPonto})` : 'Presente';
                }
            }

            if (summary[statusKey] !== undefined) {
                summary[statusKey]++;
            }

            // Calcula horas
            if (hoursInfo.hours > 0) {
                if (statusKey !== 'off' && statusKey !== 'none') {
                    summary.escalaDeveria += hoursInfo.hours;
                    if (!isAusente || isReposto) {
                        summary.escalaFeitas += hoursInfo.hours;
                    }
                } else if (statusKey === 'off' && isReposto) {
                    summary.escalaFeitas += hoursInfo.hours;
                }
            }
            
            const tile = createTile(day.dateObj, rawText, statusKey, hoursInfo);
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
    function createTile(dateObj, rawText, statusKey, hoursInfo) {
        const tile = document.createElement('div');
        tile.className = 'compact-tile';
        tile.setAttribute('data-status', statusKey);
        
        const dayNumber = dateObj.getDate();
        const weekday = dateObj.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
        
        const humanStatus = _esc_getHumanLabel(statusKey);
        
        // Build the display text for the body
        let bodyText = '';
        if (hoursInfo && hoursInfo.startTime && hoursInfo.endTime) {
            // Show the time range prominently
            bodyText = `${hoursInfo.startTime} - ${hoursInfo.endTime}`;
            // Add duration if significant
            if (hoursInfo.hours >= 1) {
                bodyText += `<br><span style="font-size: 0.75em; opacity: 0.8;">${hoursInfo.hours.toFixed(1)}h</span>`;
            }
        } else if (rawText && rawText.trim() !== '') {
            bodyText = rawText.trim();
        } else {
            bodyText = humanStatus;
        }
        
        const tooltipText = rawText && rawText.trim() !== '' ? rawText.trim() : humanStatus;
        tile.setAttribute('data-tip', tooltipText); // Tooltip

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

        /**
         * [MASTERPIECE] Renderiza a aba de Notas Teóricas com design revolucionário e artístico
         * Versão v35 - Theoretical Excellence Edition
         * Design glorioso digno do Portal de Ensino da USP
         */
        function renderTabNotasTeoricas(notas) {
            console.log('[renderTabNotasTeoricas v35 - Theoretical Excellence] Dados recebidos:', notas);
            console.log('[renderTabNotasTeoricas] Tipo:', typeof notas);
            console.log('[renderTabNotasTeoricas] É null?', notas === null);
            console.log('[renderTabNotasTeoricas] É undefined?', notas === undefined);
            console.log('[renderTabNotasTeoricas] Número de chaves:', notas ? Object.keys(notas).length : 0);
            if (notas) {
                console.log('[renderTabNotasTeoricas] Chaves disponíveis:', Object.keys(notas).slice(0, 10));
            }
            
            // Helper function to get value from notas object with accent-insensitive key matching
            const getNotaValue = (materia) => {
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
                
                if (matchingKey) {
                    console.log(`[renderTabNotasTeoricas] Encontrada correspondência: "${materia}" -> "${matchingKey}"`);
                    return notas[matchingKey];
                }
                
                return undefined;
            };
            
            const tabContainer = document.getElementById('notas-t-content-wrapper');

            // === EMPTY STATE ARTÍSTICO === //
            if (!notas || typeof notas !== 'object' || Object.keys(notas).length === 0) {
                console.log('[renderTabNotasTeoricas] EMPTY STATE - Motivo:', 
                    !notas ? 'notas é falsy' : 
                    typeof notas !== 'object' ? 'notas não é objeto' : 
                    'notas não tem chaves');
                tabContainer.innerHTML = `
                    <div class="nt-empty-state">
                        <svg class="nt-empty-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                        </svg>
                        <div>
                            <h3 class="nt-empty-title">Nenhuma Avaliação Teórica Registrada</h3>
                            <p class="nt-empty-description">
                                As notas teóricas aparecem aqui quando as avaliações dos módulos são concluídas e processadas.
                            </p>
                            <div class="nt-empty-badge">
                                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                </svg>
                                Sistema Acadêmico Integrado
                            </div>
                        </div>
                    </div>
                `;
                return;
            }

            // === DEFINIÇÃO DOS GRUPOS DE MÓDULOS === //
            const mediaGroups = {
                'Fisioterapia I': {
                    materias: ['Anatomopatologia', 'Sub/Anatomopatologia', 'Bases', 'Sub/Bases', 'Doenças Pulmonares', 'Doenças Cardíacas', 'Proc. Cirurgico', 'Avaliação', 'Sub/Avaliacao', 'VM', 'Sub/VM'],
                    icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
                    gradient: 'from-purple-500 to-indigo-600',
                    color: '#8b5cf6'
                },
                'Fisioterapia II': {
                    materias: ['Técnicas e Recursos', 'Diag. Imagem'],
                    icon: 'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
                    gradient: 'from-blue-500 to-cyan-600',
                    color: '#3b82f6'
                },
                'Fisioterapia III': {
                    materias: ['Fisio aplicada', 'UTI'],
                    icon: 'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z',
                    gradient: 'from-rose-500 to-pink-600',
                    color: '#f43f5e'
                },
                'Fisioterapia IV': {
                    materias: ['Pediatria', 'Mobilização', 'Reab. Pulmonar'],
                    icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z',
                    gradient: 'from-green-500 to-emerald-600',
                    color: '#10b981'
                },
                'Disciplinas Complementares': {
                    materias: ['M. Cientifica', 'Saúde e politicas', 'Farmacoterapia', 'Bioética'],
                    icon: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z',
                    gradient: 'from-amber-500 to-orange-600',
                    color: '#f59e0b'
                }
            };

            // === CALCULAR MÉTRICAS GLOBAIS === //
            let totalSum = 0;
            let totalCount = 0;
            let highestGrade = 0;
            let lowestGrade = 10;
            const moduleGrades = [];

            // Processa todas as médias (chaves que contêm "MÉDIA" ou "MEDIA" - normalizado sem acento)
            const mediaKeys = Object.keys(notas).filter(k => {
                const keyUpper = k.toUpperCase();
                const keyNormalized = k.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
                return keyUpper.includes('MÉDIA') || keyNormalized.includes('MEDIA');
            });
            console.log('[renderTabNotasTeoricas] Chaves de médias encontradas:', mediaKeys);
            console.log('[renderTabNotasTeoricas] Todas as chaves disponíveis:', Object.keys(notas));
            
            // Adiciona "Outras" se houver disciplinas complementares
            if (mediaGroups['Disciplinas Complementares'].materias.some(m => {
                const val = getNotaValue(m);
                return val && parseNota(val) > 0;
            })) {
                console.log('[renderTabNotasTeoricas] Encontradas disciplinas complementares');
                // Verifica se não existe uma chave de média para disciplinas complementares
                if (!mediaKeys.some(k => k.toUpperCase().includes('OUTRAS') || k.toUpperCase().includes('COMPLEMENTARES'))) {
                    mediaKeys.push('Outras');
                }
            }

            // Verifica se há alguma nota individual (mesmo sem médias)
            const hasIndividualGrades = Object.entries(mediaGroups).some(([groupName, group]) => 
                group.materias.some(m => {
                    const val = getNotaValue(m);
                    return val && parseNota(val) > 0;
                })
            );
            
            console.log('[renderTabNotasTeoricas] Tem médias?', mediaKeys.length > 0);
            console.log('[renderTabNotasTeoricas] Tem notas individuais?', hasIndividualGrades);

            // Se não há médias NEM notas individuais, mostra mensagem
            if (mediaKeys.length === 0 && !hasIndividualGrades) {
                console.log('[renderTabNotasTeoricas] Nenhuma média ou nota encontrada, mostrando mensagem de vazio');
                tabContainer.innerHTML = '<div class="content-card p-6"><p class="text-slate-500 text-sm italic">Nenhuma nota ou média encontrada neste registro.</p></div>';
                return;
            }

            // Processa cada grupo de módulo
            mediaKeys.forEach(key => {
                const mediaValue = parseNota(notas[key]);
                if (mediaValue > 0) {
                    totalSum += mediaValue;
                    totalCount++;
                    highestGrade = Math.max(highestGrade, mediaValue);
                    lowestGrade = Math.min(lowestGrade, mediaValue);
                    moduleGrades.push({ name: key, value: mediaValue });
                }
            });

            const overallAvg = totalCount > 0 ? totalSum / totalCount : 0;
            const progressPercent = overallAvg * 10;

            // Determina a mensagem de performance
            let performanceMessage = '⚠ Precisa de atenção';
            let performanceColor = '#f59e0b';
            if (overallAvg >= 9.0) {
                performanceMessage = '🌟 Excelência Acadêmica';
                performanceColor = '#10b981';
            } else if (overallAvg >= 8.5) {
                performanceMessage = '⭐ Desempenho Excepcional';
                performanceColor = '#10b981';
            } else if (overallAvg >= 8.0) {
                performanceMessage = '✓ Muito Bom';
                performanceColor = '#3b82f6';
            } else if (overallAvg >= 7.0) {
                performanceMessage = '✓ Bom Desempenho';
                performanceColor = '#3b82f6';
            }

            // === HERO SECTION === //
            let heroHtml = `
                <div class="nt-hero-section">
                    <div class="nt-hero-content">
                        <h1 class="nt-hero-title">Avaliações Teóricas</h1>
                        <p class="nt-hero-subtitle">
                            Análise completa do desempenho nos módulos teóricos do programa de Fisioterapia
                        </p>
                        <div class="nt-validation-badge">
                            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                            </svg>
                            ${totalCount} Módulo${totalCount > 1 ? 's' : ''} Avaliado${totalCount > 1 ? 's' : ''}
                        </div>
                    </div>
                </div>
            `;

            // === DASHBOARD PRINCIPAL === //
            let dashboardHtml = `
                <div class="nt-dashboard-grid">
                    <!-- Anel de Progresso Masterpiece -->
                    <div class="nt-progress-masterpiece">
                        <div class="nt-progress-content">
                            <div class="nt-ring-container">
                                <div class="nt-progress-ring" style="--nt-progress-percent: ${progressPercent}%;">
                                    <div class="nt-ring-value">${formatarNota(overallAvg)}</div>
                                    <div class="nt-ring-subtitle">de 10,0</div>
                                </div>
                            </div>
                            <div class="nt-progress-text">
                                <h2 class="nt-progress-title">Média Geral Teórica</h2>
                                <p class="nt-progress-description" style="color: ${performanceColor};">
                                    ${performanceMessage}
                                </p>
                                <div class="nt-progress-meta">
                                    <svg class="nt-progress-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                        <path stroke-linecap="round" stroke-linejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                    </svg>
                                    <span class="nt-progress-stats">
                                        Baseado em <strong>${totalCount}</strong> módulo${totalCount > 1 ? 's' : ''}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Stats Cards -->
                    <div class="nt-stats-grid">
                        <div class="nt-stat-card">
                            <div class="nt-stat-icon" style="background: linear-gradient(135deg, #10b981, #059669);">
                                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                                </svg>
                            </div>
                            <div>
                                <div class="nt-stat-value">${formatarNota(highestGrade)}</div>
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
                                <div class="nt-stat-value">${lowestGrade < 10 ? formatarNota(lowestGrade) : '-'}</div>
                                <div class="nt-stat-label">Menor Nota</div>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            // === DIVIDER === //
            let dividerHtml = '<div class="nt-section-divider"></div>';

            // === MÓDULOS TEÓRICOS DETALHADOS === //
            let modulesHtml = `
                <div style="margin: 2.5rem 0 1.5rem;">
                    <h3 style="font-family: var(--font-display); font-size: 1.75rem; font-weight: 800; color: var(--content-text-primary); margin-bottom: 0.75rem;">Módulos Teóricos Detalhados</h3>
                    <p style="font-size: 1rem; color: var(--content-text-secondary);">Desempenho completo por módulo e disciplina</p>
                </div>
                <div class="nt-modules-grid">
            `;

            // Para cada grupo de módulo, cria um card
            Object.entries(mediaGroups).forEach(([groupName, groupData]) => {
                const { materias, icon, gradient, color } = groupData;
                
                // Encontra a média do grupo (procura pela chave que corresponde)
                let mediaKey = null;
                let mediaValue = 0;
                
                // Tenta encontrar a média correspondente
                if (groupName === 'Disciplinas Complementares') {
                    // Para disciplinas complementares, calcula a média das matérias
                    let sum = 0;
                    let count = 0;
                    materias.forEach(materia => {
                        const val = getNotaValue(materia);
                        const nota = parseNota(val);
                        if (nota > 0) {
                            sum += nota;
                            count++;
                        }
                    });
                    mediaValue = count > 0 ? sum / count : 0;
                } else {
                    // Para os outros módulos, procura pela chave de média
                    const fisioNumber = groupName.match(/I{1,4}$/)?.[0];
                    if (fisioNumber) {
                        mediaKey = Object.keys(notas).find(k => {
                            const kUpper = k.toUpperCase();
                            const kNormalized = k.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
                            return (kUpper.includes('MÉDIA') || kNormalized.includes('MEDIA')) && 
                                   (kUpper.includes(`FISIO${fisioNumber.length}`) || kNormalized.includes(`FISIO${fisioNumber.length}`));
                        });
                        if (mediaKey) {
                            mediaValue = parseNota(notas[mediaKey]);
                        }
                    }
                }

                // Processa as disciplinas do módulo
                let disciplinasHtml = '';
                let hasDetails = false;
                
                materias.forEach(materia => {
                    const val = getNotaValue(materia);
                    if (val !== null && val !== undefined && String(val).trim() !== '') {
                        const notaMateria = parseNota(val);
                        if (notaMateria > 0) {
                            const percentage = (notaMateria / 10) * 100;
                            let barColor = color;
                            
                            disciplinasHtml += `
                                <div class="nt-discipline-item" style="--nt-discipline-color: ${barColor};">
                                    <div class="nt-discipline-header">
                                        <span class="nt-discipline-name">${materia}</span>
                                        <span class="nt-discipline-value">${formatarNota(notaMateria)}</span>
                                    </div>
                                    <div class="nt-discipline-progress">
                                        <div class="nt-discipline-fill" style="width: ${percentage}%;"></div>
                                    </div>
                                </div>
                            `;
                            hasDetails = true;
                        }
                    }
                });

                // Se tem média ou disciplinas, mostra o card
                if (mediaValue > 0 || hasDetails) {
                    const percentage = (mediaValue / 10) * 100;
                    
                    modulesHtml += `
                        <div class="nt-module-card" style="--nt-module-color: ${color};">
                            <div class="nt-module-header">
                                <div class="nt-module-icon bg-gradient-to-br ${gradient}">
                                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                        <path stroke-linecap="round" stroke-linejoin="round" d="${icon}" />
                                    </svg>
                                </div>
                                <div class="nt-module-title-group">
                                    <h4 class="nt-module-title">${groupName}</h4>
                                    <p class="nt-module-subtitle">${materias.length} disciplina${materias.length > 1 ? 's' : ''}</p>
                                </div>
                                <div class="nt-module-grade">
                                    <div class="nt-grade-value">${formatarNota(mediaValue)}</div>
                                    <div class="nt-grade-label">Média</div>
                                </div>
                            </div>
                            
                            ${hasDetails ? `
                                <div class="nt-module-progress-bar">
                                    <div class="nt-module-progress-fill" style="width: ${percentage}%;"></div>
                                </div>
                                
                                <details class="nt-module-details">
                                    <summary class="nt-details-toggle">
                                        <span>Ver disciplinas do módulo</span>
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
                }
            });

            modulesHtml += '</div>';

            // === MONTAGEM FINAL === //
            tabContainer.innerHTML = heroHtml + dashboardHtml + dividerHtml + modulesHtml;
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
         * [MASTERPIECE] Renderiza a aba de Notas Práticas com design revolucionário e artístico
         * Versão v34 - Art & Perfection Edition
         */
        function renderTabNotasPraticas(notasP) {
            console.log("[renderTabNotasPraticas v34 - Art & Perfection] Dados recebidos:", notasP);
            const tabContainer = document.getElementById('tab-notas-p');
            
            // === EMPTY STATE ARTÍSTICO === //
            if (!notasP || notasP.length === 0) {
                tabContainer.innerHTML = `
                    <div class="np-empty-state">
                        <svg class="np-empty-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <div>
                            <h3 class="np-empty-title">Nenhuma Avaliação Prática Registrada</h3>
                            <p class="np-empty-description">
                                As avaliações práticas aparecem aqui quando os supervisores enviam os formulários de avaliação.
                            </p>
                            <div class="np-empty-badge">
                                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                </svg>
                                Sistema de Validação Ativo
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
            
            // Determina a mensagem de performance
            let performanceMessage = '⚠ Precisa de atenção';
            let performanceIcon = '⚠️';
            if (summary.overallAvg >= 9.0) {
                performanceMessage = '🌟 Excelência Excepcional';
                performanceIcon = '🌟';
            } else if (summary.overallAvg >= 8.5) {
                performanceMessage = '⭐ Excelente Desempenho';
                performanceIcon = '⭐';
            } else if (summary.overallAvg >= 7.5) {
                performanceMessage = '✓ Muito Bom';
                performanceIcon = '✓';
            } else if (summary.overallAvg >= 7.0) {
                performanceMessage = '✓ Bom Desempenho';
                performanceIcon = '✓';
            }
            
            // Calcula tendência
            const hasTrend = summary.last5Notes.length >= 2;
            const isTrendingUp = hasTrend && summary.last5Notes[summary.last5Notes.length - 1].value > summary.last5Notes[0].value;
            
            // === HERO SECTION === //
            let heroHtml = `
                <div class="np-hero-section">
                    <div class="np-hero-content">
                        <h1 class="np-hero-title">Avaliações Práticas</h1>
                        <p class="np-hero-subtitle">
                            Análise profunda e visual do seu desempenho em ambiente clínico real
                        </p>
                        ${hasValidatedData ? `
                            <div class="np-validation-badge">
                                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                ${totalValidated}/${notasP.length} Avaliações Validadas
                            </div>
                        ` : ''}
                    </div>
                </div>
            `;
            
            // === DASHBOARD PRINCIPAL === //
            let dashboardHtml = `
                <div class="np-dashboard-grid">
                    <!-- Anel de Progresso Masterpiece -->
                    <div class="np-progress-masterpiece">
                        <div class="np-progress-content">
                            <div class="np-ring-container">
                                <div class="np-progress-ring" style="--np-progress-percent: ${progressPercent}%;">
                                    <div class="np-ring-value">${formatarNota(summary.overallAvg)}</div>
                                    <div class="np-ring-subtitle">de 10,0</div>
                                </div>
                            </div>
                            <div class="np-progress-text">
                                <h2 class="np-progress-title">Média Geral Prática</h2>
                                <p class="np-progress-description">
                                    ${performanceMessage}
                                </p>
                                <div class="np-progress-meta">
                                    <svg class="np-progress-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                        <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                    <span class="np-progress-stats">
                                        Baseado em <strong>${notasP.length}</strong> avaliação${notasP.length > 1 ? 'ões' : ''}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            
            // Competency showcase removed as per redesign requirements
            
            // === EVOLUTION CHART === //
            let evolutionHtml = `
                <div class="np-evolution-masterpiece">
                    <div class="np-evolution-header">
                        <div class="np-evolution-title-group">
                            <h3>Evolução de Desempenho</h3>
                            <p>Acompanhamento das últimas 5 avaliações</p>
                        </div>
                        ${hasTrend ? `
                            <div class="np-trend-indicator ${isTrendingUp ? '' : 'stable'}">
                                <svg class="np-trend-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                                    ${isTrendingUp 
                                        ? '<path stroke-linecap="round" stroke-linejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />'
                                        : '<path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14" />'
                                    }
                                </svg>
                                ${isTrendingUp ? '↗ Tendência Crescente' : '→ Tendência Estável'}
                            </div>
                        ` : ''}
                    </div>
                    <div class="np-chart-canvas">
                        ${summary.last5Notes.length > 0 ? summary.last5Notes.map((note, i) => `
                            <div class="np-chart-bar">
                                <div class="np-bar-fill" style="height: ${Math.max(note.value * 25, 40)}px;">
                                    <div class="np-bar-value">${formatarNota(note.value)}</div>
                                </div>
                                <div class="np-bar-label">${note.label && note.label.length > 18 ? note.label.substring(0, 18) + '...' : (note.label || `Avaliação ${i+1}`)}</div>
                            </div>
                        `).join('') : '<p style="text-align: center; color: var(--content-text-secondary); font-style: italic; padding: 2rem 0;">Não há dados suficientes para exibir a evolução.</p>'}
                    </div>
                </div>
            `;
            
            // === DIVIDER === //
            let dividerHtml = '<div class="np-section-divider"></div>';

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
                
                // === CARD DE AVALIAÇÃO === //
                contentHtml += `
                    <div id="${tabId}" class="sub-tab-content ${isActive ? 'active' : ''}">
                        <div class="np-eval-card" style="--np-eval-color: ${gradeColor};">
                            
                            <div class="np-eval-header">
                                <div>
                                    <div class="np-eval-title-badge">
                                        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" style="width: 1rem; height: 1rem;">
                                            <path stroke-linecap="round" stroke-linejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                                        </svg>
                                        ${gradeStatus}
                                    </div>
                                    <h3 class="np-eval-name">${nomePratica}</h3>
                                    <dl class="np-eval-metadata">
                                        <div class="np-meta-item">
                                            <dt>Supervisor</dt>
                                            <dd>${n.Supervisor || 'N/A'}</dd>
                                        </div>
                                        <div class="np-meta-item">
                                            <dt>Data da Avaliação</dt>
                                            <dd>${dataFormatada}</dd>
                                        </div>
                                        <div class="np-meta-item">
                                            <dt>Unidade</dt>
                                            <dd>${n.Unidade || 'N/A'}</dd>
                                        </div>
                                        <div class="np-meta-item">
                                            <dt>Período</dt>
                                            <dd>${n.Periodo || 'N/A'}</dd>
                                        </div>
                                    </dl>
                                    ${n._uniqueId ? `
                                        <div style="margin-top: 1.5rem; padding: 1rem; background: rgba(16, 185, 129, 0.08); border: 2px solid rgba(16, 185, 129, 0.2); border-radius: 12px;">
                                            <div style="display: flex; align-items: start; gap: 0.75rem;">
                                                <svg style="width: 1.25rem; height: 1.25rem; color: #059669; flex-shrink: 0; margin-top: 0.125rem;" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                                                    <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                                <div style="flex: 1;">
                                                    <p style="font-size: 0.75rem; font-weight: 700; color: #059669; text-transform: uppercase; letter-spacing: 0.05em;">Sistema de Validação Ativo</p>
                                                    <p style="font-size: 0.75rem; color: #047857; margin-top: 0.375rem;">
                                                        ID Único: <code style="background: white; padding: 0.125rem 0.5rem; border-radius: 4px; font-weight: 600;">${n._uniqueId}</code>
                                                        ${n._validatedAt ? `<br><span style="opacity: 0.8;">Validado em: ${new Date(n._validatedAt).toLocaleString('pt-BR')}</span>` : ''}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    ` : ''}
                                </div>
                                
                                <div class="np-grade-showcase">
                                    <div class="np-grade-circle">
                                        <div>
                                            <div class="np-grade-number">${formatarNota(mediaFinal)}</div>
                                            <div class="np-grade-denominator">de 10,0</div>
                                        </div>
                                    </div>
                                    <div class="np-grade-label">Nota Final</div>
                                </div>
                            </div>
                            
                            <!-- Seção de Habilidades com Barras -->
                            ${numericalScores.length > 0 ? `
                                <div class="np-skills-section">
                                    <div class="np-section-header">
                                        <div class="np-section-icon">
                                            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                                <path stroke-linecap="round" stroke-linejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                            </svg>
                                        </div>
                                        <h4 class="np-section-title">Desempenho por Competência</h4>
                                    </div>
                                    ${numericalScores.map(score => {
                                        const percentage = (score.value / 10) * 100;
                                        let barColor = '#3b82f6';
                                        if (score.value >= 9) barColor = '#10b981';
                                        else if (score.value >= 7) barColor = '#6366f1';
                                        else if (score.value < 6) barColor = '#ef4444';
                                        
                                        const displayLabel = splitConcatenatedFieldName(score.label);
                                        return `
                                            <div class="np-skill-bar-item" style="--np-skill-color: ${barColor};">
                                                <div class="np-skill-header">
                                                    <span class="np-skill-name" title="${score.label}">${displayLabel}</span>
                                                    <span class="np-skill-value">${formatarNota(score.value)}</span>
                                                </div>
                                                <div class="np-skill-progress">
                                                    <div class="np-skill-fill" style="width: ${percentage}%;"></div>
                                                </div>
                                            </div>
                                        `;
                                    }).join('')}
                                </div>
                            ` : ''}
                            
                            <!-- Checklist de Habilidades -->
                            ${checklistScores.length > 0 ? `
                                <div class="np-checklist-section">
                                    <div class="np-section-header">
                                        <div class="np-section-icon">
                                            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                                <path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                                            </svg>
                                        </div>
                                        <h4 class="np-section-title">Checklist de Habilidades</h4>
                                    </div>
                                    <div class="np-checklist-grid">
                                        ${checklistScores.map(skill => {
                                            const displayLabel = splitConcatenatedFieldName(skill.label);
                                            return `
                                            <div class="np-checklist-item">
                                                <div class="np-checklist-question" title="${skill.label}">${displayLabel}</div>
                                                <div class="np-checklist-answer" title="${skill.value}">${skill.value}</div>
                                            </div>
                                        `;}).join('')}
                                    </div>
                                </div>
                            ` : ''}
                            
                            <!-- Feedback do Supervisor -->
                            <div class="np-feedback-card">
                                <div class="np-feedback-header">
                                    <div class="np-feedback-title-group">
                                        <div class="np-feedback-icon">
                                            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                                <path stroke-linecap="round" stroke-linejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                                            </svg>
                                        </div>
                                        <h4 class="np-feedback-label">Feedback do Supervisor</h4>
                                    </div>
                                    <button class="gemini-analysis-button" data-loading="false" data-comment="${comentarioEscapado}">
                                        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                            <path stroke-linecap="round" stroke-linejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                                        </svg>
                                        Analisar com IA
                                    </button>
                                </div>
                                <div class="np-feedback-text">${comentario}</div>
                            </div>
                        </div>
                    </div>
                `;
            });

            // === MONTAGEM FINAL DO HTML === //
            tabContainer.innerHTML = `
                ${heroHtml}
                ${dashboardHtml}
                ${evolutionHtml}
                ${dividerHtml}
                <div style="margin: 2.5rem 0 1.5rem;">
                    <h3 style="font-family: var(--font-display); font-size: 1.75rem; font-weight: 800; color: var(--content-text-primary); margin-bottom: 0.75rem;">Avaliações Detalhadas</h3>
                    <p style="font-size: 1rem; color: var(--content-text-secondary);">Histórico completo com análise profunda de cada avaliação</p>
                </div>
                <div class="np-tab-nav">
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
            console.log("DOM Carregado. Aguardando Firebase SDK...");
            
            // CRITICAL FIX: Disable login button until Firebase is ready
            const loginButton = document.getElementById('login-button');
            if (loginButton) {
                loginButton.disabled = true;
                loginButton.textContent = 'Aguarde...';
                console.log('[Firebase] Login button disabled - waiting for Firebase SDK');
            }
            
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
                    showError('Firebase falhou ao inicializar. Verifique o console (F12) para mais detalhes e recarregue a página.', false);
                    return;
                }
                
                // CRITICAL FIX: Enable login button now that Firebase is ready
                const loginButton = document.getElementById('login-button');
                if (loginButton) {
                    loginButton.disabled = false;
                    loginButton.textContent = 'Entrar';
                    console.log('[Firebase] Login button enabled - Firebase is ready');
                }
                
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
                        initializeApp();
                    }
                }, 3000);
            }
        });

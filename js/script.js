/* ==========================================================================
   PROSOL ACADEMY - Sistema de Gestão Esportiva
   script.js - v2.0 (responsivo: notebook + celular)
   ========================================================================== */

'use strict';

/* --------------------------------------------------------------------------
   1. CONFIGURAÇÃO
   -------------------------------------------------------------------------- */
const SUPABASE_URL = 'https://smyyaugghkiofqiibpjo.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_1wTBxq7IVU5QzxxsWqla6A_uIfyvhTA';

/** Turmas do sistema — altere AQUI e reflete em todos os selects/relatórios. */
const TURMAS = [
    'Segunda e Quarta - 18:30 às 19:30',
    'Segunda e Quarta - 19:40 às 20:40',
    'Terça e Quinta - 18:30 às 19:30'
];

const LS_ATHLETES = 'prosol_athletes_cache';
const LS_ATTENDANCE = 'prosol_attendance_cache';

let _supabase = null;
try {
    if (typeof supabase !== 'undefined' && supabase.createClient) {
        _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
} catch (e) {
    console.warn('Supabase indisponível, usando somente cache local.', e);
}

let globalAthletes = [];
let globalAttendance = [];

/* --------------------------------------------------------------------------
   2. UTILITÁRIOS
   -------------------------------------------------------------------------- */
const $ = (id) => document.getElementById(id);

function esc(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Normaliza qualquer data para o padrão ISO (AAAA-MM-DD).
 * A base atual mistura "DD/MM/AAAA" (atletas) e "AAAA-MM-DD" (chamadas).
 */
function toISO(v) {
    if (!v) return '';
    const s = String(v).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;                    // já ISO
    const br = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/); // DD/MM/AAAA
    if (br) return `${br[3]}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`;
    const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);            // AAAA-M-D
    if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
        return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0];
    }
    return '';
}

/** Exibe qualquer data no formato brasileiro DD/MM/AAAA. */
function fmtDate(v) {
    const iso = toISO(v);
    return iso ? iso.split('-').reverse().join('/') : '-';
}

function getYear(v) {
    const iso = toISO(v);
    return iso ? iso.split('-')[0] : '';
}

/** Normaliza os registros vindos da nuvem para uso interno consistente. */
function normalizeAthlete(a) {
    return Object.assign({}, a, {
        id: String(a.id),
        nome: (a.nome || '').trim(),
        apelido: a.apelido || '',
        dataNasc: toISO(a.dataNasc),
        dataCadastro: toISO(a.dataCadastro),
        turma: a.turma || '',
        indicacao: a.indicacao || '-',
        telefoneAtleta: a.telefoneAtleta || '-',
        responsavel: a.responsavel || '-',
        telefone: a.telefone || '-',
        foto: a.foto || ''
    });
}

function normalizeAttendance(r) {
    return Object.assign({}, r, {
        id: String(r.id),
        data: toISO(r.data),
        turma: r.turma || '',
        obs: r.obs || '-',
        presentes: Array.isArray(r.presentes)
            ? r.presentes.map(n => String(n).trim())
            : (typeof r.presentes === 'string' ? tryParseArray(r.presentes) : [])
    });
}

function tryParseArray(s) {
    try { const v = JSON.parse(s); return Array.isArray(v) ? v.map(x => String(x).trim()) : []; }
    catch (e) { return s ? s.split(',').map(x => x.trim()) : []; }
}

/* --------------------------------------------------------------------------
   VÍNCULO CHAMADA ↔ ATLETA
   As chamadas gravam o NOME do atleta. Se o cadastro é renomeado (ou foi
   digitado sem acento/abreviado), o vínculo quebra e a frequência zera.
   As funções abaixo fazem a correspondência tolerante a acentos, caixa,
   espaços e abreviações ("Daniel G. Miranda" → "Daniel Gonçalves Miranda").
   -------------------------------------------------------------------------- */
function normName(s) {
    return String(s || '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ').trim();
}

let _matchCache = new Map();
function resetMatchCache() { _matchCache = new Map(); }

/** Resolve um nome gravado na chamada para o atleta correspondente. */
function resolveAthleteByName(nome) {
    const key = normName(nome);
    if (!key) return null;
    if (_matchCache.has(key)) return _matchCache.get(key);

    let found = globalAthletes.find(a => normName(a.nome) === key);

    if (!found) {
        // prefixo: um nome é o começo do outro (nome completo x resumido)
        const cand = globalAthletes.filter(a => {
            const n = normName(a.nome);
            return n.startsWith(key + ' ') || key.startsWith(n + ' ');
        });
        if (cand.length === 1) found = cand[0];
    }

    if (!found) {
        // abreviações: mesmo primeiro e último nome
        const t = key.split(' ');
        if (t.length >= 2) {
            const cand = globalAthletes.filter(a => {
                const n = normName(a.nome).split(' ');
                return n.length >= 2 && n[0] === t[0] && n[n.length - 1] === t[t.length - 1];
            });
            if (cand.length === 1) found = cand[0];
        }
    }

    _matchCache.set(key, found || null);
    return found || null;
}

/** Conjunto de IDs dos atletas presentes em um registro de chamada. */
function presentIdSet(record) {
    const set = new Set();
    (record.presentes || []).forEach(n => {
        const a = resolveAthleteByName(n);
        if (a) set.add(String(a.id));
    });
    return set;
}

/* --------------------------------------------------------------------------
   GERAÇÃO DE ID DE ATLETA
   O banco usa IDs sequenciais ("1", "2", ... "86"). Gerar ID com Date.now()
   produziria números de 13 dígitos, que estouram colunas do tipo INT4 no
   Postgres/Supabase (limite 2.147.483.647) e quebrariam o padrão da base.
   Aqui sempre pegamos "maior ID + 1", reaproveitando buracos só quando não
   houver risco de colisão.
   -------------------------------------------------------------------------- */
function nextAthleteId() {
    const usados = new Set(globalAthletes.map(a => String(a.id)));
    const numericos = globalAthletes
        .map(a => Number(a.id))
        .filter(n => Number.isFinite(n) && n > 0 && n < 2147483000);

    let proximo = (numericos.length ? Math.max(...numericos) : 0) + 1;
    while (usados.has(String(proximo))) proximo++;
    return String(proximo);
}

/**
 * Remove/renomeia um atleta dentro das chamadas já salvas.
 * As chamadas guardam NOMES, então excluir (ou renomear) um atleta deixaria
 * "nomes órfãos" e o contador de presentes ficaria maior que a lista real.
 * Retorna os registros de chamada que precisam ser regravados na nuvem.
 */
function syncAttendanceNames(nomeAntigo, nomeNovo) {
    const alvo = normName(nomeAntigo);
    if (!alvo) return [];
    const alterados = [];

    globalAttendance.forEach(rec => {
        if (!Array.isArray(rec.presentes)) return;
        const original = rec.presentes;
        let mudou = false;

        const novos = [];
        original.forEach(n => {
            if (normName(n) === alvo) {
                mudou = true;
                if (nomeNovo) novos.push(nomeNovo); // renomeou
                // se nomeNovo for null, o nome simplesmente sai (exclusão)
            } else {
                novos.push(n);
            }
        });

        if (mudou) {
            rec.presentes = novos;
            alterados.push(rec);
        }
    });

    return alterados;
}

/** Formata telefone só com dígitos para exibição legível. */
function fmtPhone(v) {
    if (!v || v === '-') return '';
    const d = String(v).replace(/\D/g, '');
    if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return String(v);
}

function todayISO() {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0];
}

function isMobile() { return window.matchMedia('(max-width: 780px)').matches; }

/** Notificação discreta (substitui alert em ações comuns). */
function toast(msg, type) {
    const box = $('toastBox');
    if (!box) { alert(msg); return; }
    const el = document.createElement('div');
    el.className = 'toast' + (type ? ' ' + type : '');
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(() => {
        el.style.transition = 'opacity .3s, transform .3s';
        el.style.opacity = '0';
        el.style.transform = 'translateY(10px)';
        setTimeout(() => el.remove(), 320);
    }, 2800);
}

function setSyncStatus(state, label) {
    const el = $('syncStatus');
    if (!el) return;
    el.className = 'sync-dot ' + state;
    el.title = label;
    el.innerHTML = '<span>' + esc(label) + '</span>';
}

/** Preenche todos os <select> marcados com as turmas configuradas. */
function populateTurmaSelects() {
    document.querySelectorAll('select[data-turmas]').forEach(sel => {
        const cur = sel.value;
        sel.innerHTML = '<option value="">Selecione uma turma...</option>' +
            TURMAS.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('');
        if (cur) sel.value = cur;
    });
    document.querySelectorAll('select[data-turmas-filtro]').forEach(sel => {
        const cur = sel.value;
        sel.innerHTML = '<option value="TODAS">Todas as turmas</option>' +
            TURMAS.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('');
        if (cur) sel.value = cur;
    });
}

/* --------------------------------------------------------------------------
   3. PERSISTÊNCIA (Supabase + cache local offline)
   -------------------------------------------------------------------------- */
function saveLocalCache() {
    try {
        localStorage.setItem(LS_ATHLETES, JSON.stringify(globalAthletes));
        localStorage.setItem(LS_ATTENDANCE, JSON.stringify(globalAttendance));
    } catch (e) { /* quota excedida (fotos grandes) — ignora */ }
}

function loadLocalCache() {
    try {
        globalAthletes = JSON.parse(localStorage.getItem(LS_ATHLETES) || '[]').map(normalizeAthlete);
        globalAttendance = JSON.parse(localStorage.getItem(LS_ATTENDANCE) || '[]').map(normalizeAttendance);
        resetMatchCache();
    } catch (e) {
        globalAthletes = []; globalAttendance = [];
    }
}

async function loadDataFromSupabase() {
    if (!_supabase) {
        loadLocalCache();
        setSyncStatus('offline', 'Offline (local)');
        return;
    }
    setSyncStatus('', 'Sincronizando…');
    try {
        const [resA, resC] = await Promise.all([
            _supabase.from('atletas').select('*'),
            _supabase.from('chamadas').select('*')
        ]);

        if (resA.error) throw resA.error;
        if (resC.error) throw resC.error;

        globalAthletes = (resA.data || []).map(normalizeAthlete);
        globalAttendance = (resC.data || []).map(normalizeAttendance);
        resetMatchCache();
        saveLocalCache();
        setSyncStatus('online', 'Sincronizado');
    } catch (err) {
        console.error('Erro ao carregar do Supabase:', err);
        loadLocalCache();
        setSyncStatus('error', 'Offline (cache)');
        toast('Sem conexão com a nuvem. Exibindo dados salvos no aparelho.', 'warn');
    }
}

async function saveData(type, dataObj) {
    saveLocalCache();
    if (!_supabase) return;
    const table = type === 'athlete' ? 'atletas' : 'chamadas';
    try {
        const { error } = await _supabase.from(table).upsert([dataObj]);
        if (error) throw error;
        setSyncStatus('online', 'Sincronizado');
    } catch (error) {
        console.error(error);
        setSyncStatus('error', 'Erro de sincronia');
        toast('Erro ao salvar na nuvem: ' + (error.message || error), 'error');
    }
}

async function deleteAthleteFromCloud(id) {
    saveLocalCache();
    if (!_supabase) return;
    const { error } = await _supabase.from('atletas').delete().eq('id', id);
    if (error) toast('Erro ao excluir atleta: ' + error.message, 'error');
}

async function deleteAttendanceFromCloud(id) {
    saveLocalCache();
    if (!_supabase) return;
    const { error } = await _supabase.from('chamadas').delete().eq('id', id);
    if (error) toast('Erro ao excluir chamada: ' + error.message, 'error');
}

/* --------------------------------------------------------------------------
   4. NAVEGAÇÃO
   -------------------------------------------------------------------------- */
async function openApp() {
    $('login').classList.remove('active');
    $('login').style.display = 'none';
    $('app').classList.add('active');

    $('chamadaData').value = todayISO();

    await loadDataFromSupabase();
    renderAthletesTable();
}

function logout() {
    $('app').classList.remove('active');
    $('login').style.display = '';
    $('login').classList.add('active');
    window.scrollTo(0, 0);
}

let currentTab = 0;
function showTab(index) {
    currentTab = index;

    document.querySelectorAll('nav.top-tabs .tab-btn')
        .forEach((btn, i) => btn.classList.toggle('active', i === index));
    document.querySelectorAll('#bottomNav button')
        .forEach((btn, i) => btn.classList.toggle('active', i === index));
    document.querySelectorAll('#app main section')
        .forEach((sec, i) => sec.classList.toggle('hidden', i !== index));

    if (index === 0) renderAthletesTable();
    if (index === 1 && !$('attendanceId').value) loadAttendanceList();
    if (index === 2) renderAttendanceHistory();
    if (index === 3) renderAttendanceReport();

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* --------------------------------------------------------------------------
   5. FORMULÁRIO DE ATLETA
   -------------------------------------------------------------------------- */
let currentPhotoBase64 = '';

function openNewAthleteForm() {
    $('athleteId').value = '';
    $('athleteDataCadastro').value = '';
    $('athleteForm').reset();
    $('formAthleteTitle').textContent = 'Cadastrar Novo Atleta';
    $('btnSaveAthlete').textContent = 'Salvar Atleta';
    currentPhotoBase64 = '';
    $('photoPreviewContainer').classList.add('hidden');
    $('form').classList.remove('hidden');
    $('form').scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => $('nome').focus(), 300);
}

function toggleForm() {
    const el = $('form');
    el.classList.toggle('hidden');
    if (el.classList.contains('hidden')) {
        $('athleteId').value = '';
        $('athleteDataCadastro').value = '';
        $('athleteForm').reset();
        currentPhotoBase64 = '';
        $('photoPreviewContainer').classList.add('hidden');
    }
}

function toggleReportOptions() {
    $('reportOptionsCard').classList.toggle('hidden');
}

/** Lê a foto e comprime para no máx. 600px — essencial em celular. */
function previewPhoto(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        const img = new Image();
        img.onload = function () {
            const MAX = 600;
            let { width, height } = img;
            if (width > MAX || height > MAX) {
                const r = Math.min(MAX / width, MAX / height);
                width = Math.round(width * r);
                height = Math.round(height * r);
            }
            const canvas = document.createElement('canvas');
            canvas.width = width; canvas.height = height;
            canvas.getContext('2d').drawImage(img, 0, 0, width, height);
            try {
                currentPhotoBase64 = canvas.toDataURL('image/jpeg', 0.8);
            } catch (err) {
                currentPhotoBase64 = e.target.result;
            }
            $('photoPreview').src = currentPhotoBase64;
            $('photoPreviewContainer').classList.remove('hidden');
        };
        img.onerror = function () {
            currentPhotoBase64 = e.target.result;
            $('photoPreview').src = currentPhotoBase64;
            $('photoPreviewContainer').classList.remove('hidden');
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function openPhotoNewTab(athleteId) {
    const a = globalAthletes.find(x => String(x.id) === String(athleteId));
    if (!a || !a.foto) return;
    const w = window.open('');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>Foto - ${esc(a.nome)}</title>
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <style>body{margin:0;background:#111;display:flex;justify-content:center;align-items:center;min-height:100vh}
        img{max-width:95vw;max-height:95vh;border-radius:8px}</style></head>
        <body><img src="${a.foto}" alt="Foto"></body></html>`);
    w.document.close();
}

function saveAthlete(event) {
    event.preventDefault();

    const id = $('athleteId').value;
    const existingDataCadastro = $('athleteDataCadastro').value;
    const nome = $('nome').value.trim();
    const apelido = $('apelido').value.trim();
    const dataNasc = $('dataNasc').value;
    const turma = $('turma').value;
    const indicacao = $('indicacao').value.trim();
    const telefoneAtleta = $('telefoneAtleta').value.trim();
    const responsavel = $('responsavel').value.trim();
    const telefone = $('telefone').value.trim();

    if (!nome || !apelido || !dataNasc || !turma) {
        toast('Preencha os campos obrigatórios: Nome, Apelido, Nascimento e Turma.', 'error');
        return;
    }

    // Preserva quaisquer campos extras já existentes no banco (ex.: Documento)
    const previous = id ? globalAthletes.find(a => String(a.id) === String(id)) : null;

    const athleteData = Object.assign({}, previous || {}, {
        id: id || nextAthleteId(),
        dataCadastro: toISO(existingDataCadastro) || todayISO(),
        nome, apelido,
        dataNasc: toISO(dataNasc),
        turma,
        indicacao: indicacao || '-',
        telefoneAtleta: telefoneAtleta || '-',
        responsavel: responsavel || '-',
        telefone: telefone || '-',
        foto: currentPhotoBase64
    });

    const doc = $('documento') ? $('documento').value.trim() : '';
    if (doc || 'Documento' in athleteData) athleteData.Documento = doc || null;

    let chamadasAtualizadas = [];

    if (id) {
        const i = globalAthletes.findIndex(a => String(a.id) === String(id));
        const nomeAnterior = i !== -1 ? globalAthletes[i].nome : null;
        if (i !== -1) globalAthletes[i] = athleteData;

        // Se o nome mudou, atualiza as chamadas já salvas para o vínculo não quebrar
        if (nomeAnterior && normName(nomeAnterior) !== normName(nome)) {
            chamadasAtualizadas = syncAttendanceNames(nomeAnterior, nome);
        }
    } else {
        globalAthletes.push(athleteData);
    }

    resetMatchCache();
    saveData('athlete', athleteData);
    chamadasAtualizadas.forEach(rec => saveData('attendance', rec));

    let msg = id ? 'Atleta atualizado com sucesso!' : 'Atleta cadastrado com sucesso!';
    if (chamadasAtualizadas.length) {
        msg += ` ${chamadasAtualizadas.length} chamada(s) ajustada(s) com o novo nome.`;
    }
    toast(msg);

    $('athleteForm').reset();
    $('athleteId').value = '';
    $('athleteDataCadastro').value = '';
    currentPhotoBase64 = '';
    $('photoPreviewContainer').classList.add('hidden');
    $('form').classList.add('hidden');
    renderAthletesTable();
}

function editAthlete(id) {
    const a = globalAthletes.find(x => String(x.id) === String(id));
    if (!a) return;

    const clean = (v) => (v === '-' ? '' : (v || ''));

    $('athleteId').value = a.id;
    $('athleteDataCadastro').value = a.dataCadastro || '';
    $('nome').value = a.nome || '';
    $('apelido').value = a.apelido || '';
    $('dataNasc').value = a.dataNasc || '';
    $('turma').value = a.turma || '';
    $('indicacao').value = clean(a.indicacao);
    $('telefoneAtleta').value = fmtPhone(a.telefoneAtleta);
    $('responsavel').value = clean(a.responsavel);
    $('telefone').value = fmtPhone(a.telefone);
    if ($('documento')) $('documento').value = a.Documento || '';

    if (a.foto) {
        currentPhotoBase64 = a.foto;
        $('photoPreview').src = a.foto;
        $('photoPreviewContainer').classList.remove('hidden');
    } else {
        currentPhotoBase64 = '';
        $('photoPreviewContainer').classList.add('hidden');
    }

    $('formAthleteTitle').textContent = 'Editar Atleta';
    $('btnSaveAthlete').textContent = 'Atualizar Atleta';
    $('form').classList.remove('hidden');
    closeModal();
    $('form').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function deleteAthlete(id) {
    const a = globalAthletes.find(x => String(x.id) === String(id));
    if (!a) return;

    // Quantas chamadas registram presença deste atleta?
    const comPresenca = globalAttendance.filter(rec => presentIdSet(rec).has(String(a.id)));

    let aviso = `Excluir o atleta "${a.nome}"?\n\nEsta ação não pode ser desfeita.`;
    if (comPresenca.length) {
        aviso += `\n\nAtenção: ele tem presença em ${comPresenca.length} chamada(s).` +
                 `\nO nome dele será removido dessas chamadas para os totais continuarem corretos.`;
    }
    if (!confirm(aviso)) return;

    // 1) tira o nome das chamadas salvas (evita "nome órfão" e contagem inflada)
    const chamadasAfetadas = syncAttendanceNames(a.nome, null);

    // 2) remove o atleta
    globalAthletes = globalAthletes.filter(x => String(x.id) !== String(id));
    resetMatchCache();

    // 3) grava tudo na nuvem
    deleteAthleteFromCloud(id);
    chamadasAfetadas.forEach(rec => saveData('attendance', rec));

    closeModal();
    renderAthletesTable();

    toast(chamadasAfetadas.length
        ? `Atleta excluído e removido de ${chamadasAfetadas.length} chamada(s).`
        : 'Atleta excluído.');
}

/* --------------------------------------------------------------------------
   6. FILTROS E LISTAGEM DE ATLETAS
   -------------------------------------------------------------------------- */
function updateYearCheckboxes() {
    const container = $('filterYearCheckboxes');
    if (!container) return;

    const years = [...new Set(globalAthletes.map(a => getYear(a.dataNasc)).filter(Boolean))].sort();

    if (years.length === 0) {
        container.innerHTML = '<span style="color:var(--text-mute); font-size:.8rem;">Sem dados</span>';
        return;
    }

    const checked = Array.from(document.querySelectorAll('.filter-year-cb:checked')).map(cb => cb.value);
    container.innerHTML = years.map(y =>
        `<label><input type="checkbox" value="${y}" class="filter-year-cb" ${checked.includes(y) ? 'checked' : ''} onchange="applyFilters()"> ${y}</label>`
    ).join('');
}

function applyFilters() {
    const turma = $('filterTurma') ? $('filterTurma').value : 'TODAS';
    const term = ($('searchAthlete') ? $('searchAthlete').value : '').trim().toLowerCase();
    const years = Array.from(document.querySelectorAll('.filter-year-cb:checked')).map(cb => cb.value);

    let list = [...globalAthletes];

    if (turma && turma !== 'TODAS') list = list.filter(a => a.turma === turma);

    if (years.length) {
        list = list.filter(a => years.includes(getYear(a.dataNasc)));
    }

    if (term) {
        const digits = term.replace(/\D/g, '');
        list = list.filter(a => {
            const hay = [a.nome, a.apelido, a.responsavel, a.Documento].map(v => (v || '').toLowerCase());
            if (hay.some(v => v.includes(term))) return true;
            if (digits.length >= 3) {
                const tels = [a.telefone, a.telefoneAtleta, a.Documento]
                    .map(v => String(v || '').replace(/\D/g, ''));
                return tels.some(t => t.includes(digits));
            }
            return false;
        });
    }

    renderFilteredAthletes(list);
}

function renderAthletesTable() {
    updateYearCheckboxes();
    applyFilters();
}

function athleteAvatarHTML(a, size) {
    if (a.foto) {
        return `<img src="${a.foto}" class="athlete-avatar" alt="${esc(a.nome)}" title="Ver foto" onclick="openPhotoNewTab('${esc(a.id)}')">`;
    }
    return `<div class="athlete-avatar-fallback">${esc((a.nome || '?').charAt(0).toUpperCase())}</div>`;
}

function buildAthleteRows(list) {
    list.sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'));

    return list.map(a => {
        const resp = a.responsavel && a.responsavel !== '-' ? esc(a.responsavel) : '<span style="color:var(--text-mute)">Não inf.</span>';
        const telNum = fmtPhone(a.telefone) || fmtPhone(a.telefoneAtleta);
        const telRaw = (a.telefone && a.telefone !== '-') ? a.telefone : a.telefoneAtleta;
        const telClean = telRaw && telRaw !== '-' ? String(telRaw).replace(/\D/g, '') : '';
        const tel = telClean
            ? `<a class="wa-link" href="https://wa.me/${telClean.length <= 11 ? '55' + telClean : telClean}" target="_blank" rel="noopener">📱 ${esc(telNum)}</a>`
            : '<span style="color:var(--text-mute)">Sem telefone</span>';

        return `
        <tr>
            <td class="cell-photo" data-label="Foto">${athleteAvatarHTML(a)}</td>
            <td class="cell-main" data-label="Atleta">
                <div class="mobile-athlete-head">
                    <span class="only-mobile">${athleteAvatarHTML(a)}</span>
                    <span>
                        <strong>${esc(a.nome)}</strong>
                        ${a.apelido ? `<br><small style="color:var(--text-dim)">"${esc(a.apelido)}"</small>` : ''}
                    </span>
                </div>
            </td>
            <td data-label="Nascimento">${fmtDate(a.dataNasc)}</td>
            <td data-label="Turma"><span class="turma-badge">${esc(a.turma)}</span></td>
            <td data-label="Indicação">${esc(a.indicacao || '-')}</td>
            <td data-label="Responsável">${resp}<br><small style="font-weight:700;">${tel}</small></td>
            <td class="actions-cell" data-label="">
                <button class="btn-action btn-view" onclick="viewAthlete('${esc(a.id)}')">Ver</button>
                <button class="btn-action btn-edit" onclick="editAthlete('${esc(a.id)}')">Editar</button>
                <button class="btn-action btn-delete" onclick="deleteAthlete('${esc(a.id)}')">Excluir</button>
            </td>
        </tr>`;
    }).join('');
}

function renderFilteredAthletes(list) {
    const container = $('athletesGroups');
    $('totalAtletas').textContent = list.length;

    if (!list.length) {
        container.innerHTML = '<p class="empty-msg">Nenhum atleta encontrado com os filtros selecionados.</p>';
        return;
    }

    const head = `
        <thead>
            <tr>
                <th style="width:56px;">Foto</th>
                <th>Nome / Apelido</th>
                <th style="width:110px;">Nascimento</th>
                <th>Turma</th>
                <th>Indicação</th>
                <th>Responsável / Tel</th>
                <th style="width:190px;">Ações</th>
            </tr>
        </thead>`;

    const group = (title, arr) => `
        <div class="turma-group">
            <div class="turma-group-head">
                <h4>⚽ ${esc(title)}</h4>
                <span class="badge-count">${arr.length} atleta(s)</span>
            </div>
            <div class="table-responsive">
                <table>${head}<tbody>${buildAthleteRows(arr)}</tbody></table>
            </div>
        </div>`;

    let html = '';
    TURMAS.forEach(t => {
        const arr = list.filter(a => a.turma === t);
        if (arr.length) html += group(t, arr);
    });

    const outros = list.filter(a => !TURMAS.includes(a.turma));
    if (outros.length) html += group('Outras Turmas', outros);

    container.innerHTML = html;
}

/* --------------------------------------------------------------------------
   7. DETALHES DO ATLETA
   -------------------------------------------------------------------------- */
function athleteStats(a) {
    const id = String(a.id);
    const esteve = (h) => presentIdSet(h).has(id);

    // Aulas da turma atual + qualquer aula (de outra turma) em que ele foi
    // marcado presente — cobre atletas que trocaram de horário.
    const aulasTurma = globalAttendance.filter(h => h.turma === a.turma || esteve(h));
    const totalGeral = aulasTurma.length;
    const presencas = aulasTurma.filter(esteve).length;

    // Considera as aulas a partir do cadastro. Se o cadastro for posterior a
    // aulas em que o atleta já apareceu (base importada), usa a data da 1ª presença.
    let corte = a.dataCadastro || '';
    const primeiraPresenca = aulasTurma.filter(esteve).map(h => h.data).sort()[0];
    if (primeiraPresenca && (!corte || primeiraPresenca < corte)) corte = primeiraPresenca;

    const aulasPos = aulasTurma.filter(h => !corte || h.data >= corte);
    const totalPos = aulasPos.length;
    const presencasPos = aulasPos.filter(esteve).length;
    const faltasPos = Math.max(0, totalPos - presencasPos);

    return {
        totalGeral, totalPos, presencas, presencasPos, faltasPos, corte,
        pctPos: totalPos > 0 ? Math.round((presencasPos / totalPos) * 100) : null,
        pctGeral: totalGeral > 0 ? Math.round((presencas / totalGeral) * 100) : null
    };
}

function pctText(p) { return p === null ? '—' : p + '%'; }

function waLink(num) {
    const clean = num && num !== '-' ? String(num).replace(/\D/g, '') : '';
    if (!clean) return 'Não informado';
    const full = clean.length <= 11 ? '55' + clean : clean;
    return `<a class="wa-link" href="https://wa.me/${full}" target="_blank" rel="noopener">📱 ${esc(fmtPhone(num))}</a>`;
}

function viewAthlete(id) {
    const a = globalAthletes.find(x => String(x.id) === String(id));
    if (!a) return;
    const s = athleteStats(a);

    const photo = a.foto
        ? `<img src="${a.foto}" style="max-width:130px;max-height:130px;border-radius:12px;margin:0 auto 14px;border:2px solid var(--brand);cursor:pointer;" onclick="openPhotoNewTab('${esc(a.id)}')">`
        : `<div class="athlete-avatar-fallback" style="width:76px;height:76px;font-size:1.9rem;margin:0 auto 14px;">${esc((a.nome || '?').charAt(0))}</div>`;

    $('modalDetails').innerHTML = `
        <div style="text-align:center;">
            ${photo}
            <h2 style="margin-bottom:2px;">${esc(a.nome)}</h2>
            <p style="color:var(--text-dim);margin-bottom:14px;">"${esc(a.apelido || '')}"</p>
        </div>
        <div class="detail-row"><span>Turma</span><span>${esc(a.turma)}</span></div>
        <div class="detail-row"><span>Nascimento</span><span>${fmtDate(a.dataNasc)}</span></div>
        <div class="detail-row"><span>Cadastro</span><span>${fmtDate(a.dataCadastro)}</span></div>
        ${a.Documento ? `<div class="detail-row"><span>Documento</span><span>${esc(a.Documento)}</span></div>` : ''}
        <div class="detail-row"><span>Indicação</span><span>${esc(a.indicacao || '-')}</span></div>
        <div class="detail-row"><span>WhatsApp do atleta</span><span>${waLink(a.telefoneAtleta)}</span></div>
        <div class="detail-row"><span>Responsável</span><span>${a.responsavel && a.responsavel !== '-' ? esc(a.responsavel) : 'Não informado'}</span></div>
        <div class="detail-row"><span>WhatsApp do responsável</span><span>${waLink(a.telefone)}</span></div>

        <h4 style="margin:18px 0 6px;color:var(--brand);">Resumo de Frequência</h4>
        <div class="stat-grid">
            <div class="stat-box"><div class="v" style="color:var(--brand)">${s.presencas}</div><div class="l">Presenças</div></div>
            <div class="stat-box"><div class="v" style="color:var(--danger)">${s.faltasPos}</div><div class="l">Faltas</div></div>
            <div class="stat-box"><div class="v">${pctText(s.pctPos)}</div><div class="l">Pós-cadastro</div></div>
            <div class="stat-box"><div class="v" style="color:var(--text-dim)">${pctText(s.pctGeral)}</div><div class="l">Geral</div></div>
        </div>
        <p style="color:var(--text-mute);font-size:.78rem;margin-top:10px;">
            Aulas da turma: ${s.totalGeral} • Após o cadastro: ${s.totalPos}
        </p>
        <div class="form-buttons">
            <button class="btn-action btn-edit" style="flex:1;min-height:44px;" onclick="editAthlete('${esc(a.id)}')">Editar</button>
            <button class="btn-action btn-view" style="flex:1;min-height:44px;" onclick="viewAthleteDates('${esc(a.id)}')">Ver presenças</button>
        </div>
    `;
    openModal();
}

function openModal() {
    $('modal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    $('modal').classList.add('hidden');
    document.body.style.overflow = '';
}

/* --------------------------------------------------------------------------
   8. RELATÓRIOS EM NOVA ABA (PDF / impressão)
   -------------------------------------------------------------------------- */
function getPDFScriptTag() {
    return `
        <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"><\/script>
        <script>
            async function sharePagePDF(filename, orientation) {
                const btnBox = document.getElementById('no-print-area');
                if (btnBox) btnBox.style.display = 'none';
                const element = document.getElementById('pdf-content-area') || document.body;
                const opt = {
                    margin: [8, 8, 8, 8],
                    filename: filename,
                    image: { type: 'jpeg', quality: 0.98 },
                    html2canvas: { scale: 2, useCORS: true, logging: false },
                    jsPDF: { unit: 'mm', format: 'a4', orientation: orientation }
                };
                try {
                    html2pdf().set(opt).from(element).save().then(function () {
                        if (btnBox) btnBox.style.display = 'flex';
                    });
                } catch (err) {
                    if (btnBox) btnBox.style.display = 'flex';
                    alert('Não foi possível gerar o PDF. Use o botão Imprimir.');
                }
            }
        <\/script>`;
}

/** Estilos comuns dos relatórios — já responsivos para leitura no celular. */
function reportBaseCSS(orientation, fontSize) {
    return `
        @page { size: A4 ${orientation}; margin: 8mm; }
        * { box-sizing: border-box; }
        body { font-family: Arial, Helvetica, sans-serif; color:#111; padding:12px; line-height:1.3;
               font-size:${fontSize}; background:#fff; -webkit-text-size-adjust:100%; }
        #no-print-area { display:flex; gap:10px; flex-wrap:wrap; margin-bottom:14px; background:#f1f5f9;
                         padding:10px; border-radius:8px; border:1px solid #cbd5e1;
                         position:sticky; top:0; z-index:10; }
        #no-print-area button { flex:1 1 200px; min-height:46px; border:none; border-radius:6px;
                                cursor:pointer; font-size:.9rem; font-weight:bold; }
        .btn-print { background:#84cc16; color:#000; }
        .btn-share-pdf { background:#25d366; color:#fff; }
        table { width:100%; border-collapse:collapse; }
        th, td { border:1px solid #e5e7eb; padding:5px 7px; text-align:left; word-break:break-word; }
        th { background:#f4f9eb; color:#2e5300; font-weight:bold; }
        tr:nth-child(even) td { background:#fafafa; }
        .turma-card { border:1px solid #ccc; border-top:3px solid #84cc16; border-radius:4px;
                      margin-bottom:12px; overflow:hidden; page-break-inside:avoid; }
        .turma-header { background:#f8fafb; color:#2e5300; padding:6px 10px; font-weight:bold;
                        font-size:.85rem; border-bottom:1px solid #e5e7eb; }
        .total-box { margin-top:12px; font-weight:bold; text-align:right; color:#4d7c0f;
                     border-top:2px solid #84cc16; padding-top:8px; }
        @media (max-width: 700px) {
            body { padding:8px; font-size:.82rem; }
            table, thead, tbody, tr, td, th { display:block; width:100%; }
            thead { display:none; }
            tbody tr { border:1px solid #ddd; border-radius:6px; margin-bottom:8px; padding:6px 8px; }
            td { border:none; border-bottom:1px dashed #eee; display:flex; justify-content:space-between;
                 gap:10px; text-align:right; padding:5px 0; }
            td:last-child { border-bottom:none; }
            td::before { content:attr(data-label); font-weight:bold; color:#4d7c0f; text-align:left; }
            tr:nth-child(even) td { background:transparent; }
            .cols-2 { grid-template-columns:1fr !important; }
        }
        @media print { #no-print-area { display:none !important; } body { padding:0; } }`;
}

function generatePrintHeader() {
    const now = new Date();
    return `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;
                    border-bottom:2px solid #84cc16;padding-bottom:8px;margin-bottom:12px;">
            <div style="display:flex;align-items:center;gap:10px;">
                <img src="assets/logo.jpg" alt="" style="max-height:46px;width:auto;" onerror="this.style.display='none'"/>
                <div>
                    <h1 style="margin:0;font-size:1.15rem;color:#4d7c0f;">PROSOL ACADEMY</h1>
                    <p style="margin:1px 0 0;color:#555;font-size:.72rem;">Sistema de Gestão Esportiva</p>
                </div>
            </div>
            <div style="text-align:right;font-size:.7rem;color:#666;">
                Emissão: ${now.toLocaleDateString('pt-BR')} ${now.toLocaleTimeString('pt-BR')}
            </div>
        </div>`;
}

function openReportTab(html, emptyMsg) {
    if (!html) { toast(emptyMsg || 'Nada para exibir.', 'warn'); return; }
    const w = window.open('', '_blank');
    if (!w) { toast('Permita pop-ups no navegador para abrir o relatório.', 'error'); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
}

function reportShell(title, orientation, fontSize, filename, body) {
    return `<!DOCTYPE html><html lang="pt-br"><head><meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>${esc(title)}</title>
        <style>${reportBaseCSS(orientation, fontSize)}</style>
        ${getPDFScriptTag()}
        </head><body>
        <div id="no-print-area">
            <button class="btn-share-pdf" onclick="sharePagePDF('${filename}','${orientation}')">📥 Baixar em PDF</button>
            <button class="btn-print" onclick="window.print()">🖨️ Imprimir / Compartilhar</button>
        </div>
        <div id="pdf-content-area">${generatePrintHeader()}${body}</div>
        </body></html>`;
}

/* ---------- 8.1 Relatório de atletas ---------- */
function buildAthletesReportHTML() {
    const chk = (id) => ($(id) ? $(id).checked : false);
    const inc = {
        apelido: chk('rep_apelido'),
        dataNasc: chk('rep_dataNasc'),
        turma: chk('rep_turma'),
        telAtleta: chk('rep_telAtleta'),
        responsavel: chk('rep_responsavel'),
        telefone: chk('rep_telefone'),
        indicacao: chk('rep_indicacao'),
        documento: chk('rep_documento')
    };

    const list = [...globalAthletes];
    if (!list.length) return null;

    const count = Object.values(inc).filter(Boolean).length;
    const orientation = count <= 4 ? 'portrait' : 'landscape';

    const cols = [{ k: 'nome', label: 'Nome Completo' }];
    if (inc.apelido) cols.push({ k: 'apelido', label: 'Apelido' });
    if (inc.dataNasc) cols.push({ k: 'dataNasc', label: 'Data Nasc.', fmt: fmtDate });
    if (inc.turma) cols.push({ k: 'turma', label: 'Turma' });
    if (inc.documento) cols.push({ k: 'Documento', label: 'Documento' });
    if (inc.telAtleta) cols.push({ k: 'telefoneAtleta', label: 'Tel. Atleta', fmt: fmtPhone });
    if (inc.indicacao) cols.push({ k: 'indicacao', label: 'Indicação' });
    if (inc.responsavel) cols.push({ k: 'responsavel', label: 'Responsável' });
    if (inc.telefone) cols.push({ k: 'telefone', label: 'Tel. Responsável', fmt: fmtPhone });

    const groupTable = (arr, title) => `
        <div class="turma-card">
            <div class="turma-header">⚽ Turma: ${esc(title)} (${arr.length} atletas)</div>
            <table>
                <thead><tr>${cols.map(c => `<th>${c.label}</th>`).join('')}</tr></thead>
                <tbody>${arr.map(a => `<tr>${cols.map(c => {
                    let v = c.fmt ? c.fmt(a[c.k]) : a[c.k];
                    if (v === null || v === undefined || v === '' || v === '-') v = '-';
                    return `<td data-label="${c.label}">${c.k === 'nome' ? '<strong>' + esc(v) + '</strong>' : esc(v)}</td>`;
                }).join('')}</tr>`).join('')}</tbody>
            </table>
        </div>`;

    let cards = '';
    TURMAS.forEach(t => {
        const arr = list.filter(a => a.turma === t).sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'));
        if (arr.length) cards += groupTable(arr, t);
    });
    const outros = list.filter(a => !TURMAS.includes(a.turma));
    if (outros.length) cards += groupTable(outros, 'Outras Turmas');

    const body = `
        <h2 style="margin:0 0 10px;font-size:1rem;color:#333;">📋 Relatório Geral de Atletas Cadastrados</h2>
        ${cards}
        <div class="total-box">Total: ${list.length} atletas</div>`;

    return reportShell('Relatório de Atletas - Prosol Academy', orientation,
        orientation === 'portrait' ? '.74rem' : '.78rem', 'Relatorio_Atletas_Prosol.pdf', body);
}

function openAthletesReportTab() {
    openReportTab(buildAthletesReportHTML(), 'Nenhum atleta cadastrado para gerar relatório.');
}

/* ---------- 8.2 Chamada individual ---------- */
function attendanceLists(record) {
    const ids = presentIdSet(record);
    const isPresent = (a) => ids.has(String(a.id));

    // Atletas da turma já cadastrados na data da aula.
    const daTurma = globalAthletes.filter(a =>
        a.turma === record.turma &&
        (!a.dataCadastro || a.dataCadastro <= record.data)
    );

    // Quem foi marcado presente entra SEMPRE — mesmo que depois tenha mudado de
    // turma ou tenha data de cadastro posterior (bases importadas).
    const presentes = globalAthletes.filter(isPresent);
    const idsPresentes = new Set(presentes.map(a => String(a.id)));
    const ausentes = daTurma.filter(a => !idsPresentes.has(String(a.id)));

    const ord = (x, y) => (x.nome || '').localeCompare(y.nome || '', 'pt-BR');
    return { presentes: presentes.sort(ord), ausentes: ausentes.sort(ord) };
}

function buildSingleAttendanceHTML(recordId) {
    const r = globalAttendance.find(x => String(x.id) === String(recordId));
    if (!r) return null;
    const { presentes, ausentes } = attendanceLists(r);
    const li = (a, ok) => `<li style="padding:4px 0;border-bottom:1px dotted #eee;color:${ok ? '#15803d' : '#b91c1c'};font-weight:bold;">
        ${ok ? '✔' : '✖'} ${esc(a.nome)} (${esc(a.apelido || '')}) - ${fmtDate(a.dataNasc)}</li>`;

    const body = `
        <div style="background:#f4f9eb;padding:10px 12px;border-radius:6px;border:1px solid #d9f99d;margin-bottom:12px;">
            <p style="margin:0 0 3px;"><strong>Data da Aula:</strong> ${fmtDate(r.data)}</p>
            <p style="margin:0 0 3px;"><strong>Turma:</strong> ${esc(r.turma)}</p>
            <p style="margin:0;"><strong>Observações:</strong> ${esc(r.obs || 'Nenhuma observação informada.')}</p>
        </div>
        <h3 style="color:#4d7c0f;border-bottom:1px solid #ccc;padding-bottom:3px;font-size:.95rem;">Atletas Presentes (${presentes.length})</h3>
        <ul style="list-style:none;padding:0;margin:4px 0 14px;">${presentes.length ? presentes.map(a => li(a, true)).join('') : '<li>Nenhum presente registrado.</li>'}</ul>
        <h3 style="color:#4d7c0f;border-bottom:1px solid #ccc;padding-bottom:3px;font-size:.95rem;">Atletas Ausentes (${ausentes.length})</h3>
        <ul style="list-style:none;padding:0;margin:4px 0;">${ausentes.length ? ausentes.map(a => li(a, false)).join('') : '<li>Nenhuma falta registrada.</li>'}</ul>`;

    return reportShell(`Chamada ${fmtDate(r.data)} - Prosol Academy`, 'portrait', '.82rem',
        `Chamada_Prosol_${r.data}.pdf`, body);
}

function openSingleAttendanceTab(recordId) {
    openReportTab(buildSingleAttendanceHTML(recordId), 'Chamada não encontrada.');
}

/* ---------- 8.3 Chamadas filtradas ---------- */
function buildFilteredAttendancesHTML() {
    const records = getFilteredAttendances();
    if (!records.length) return null;
    records.sort((a, b) => String(b.data).localeCompare(String(a.data)));

    const dtIni = $('filterDataInicio').value;
    const dtFim = $('filterDataFim').value;
    let periodo = 'Todas as chamadas cadastradas';
    if (dtIni || dtFim) {
        periodo = `Período de ${dtIni ? fmtDate(dtIni) : 'Início'} até ${dtFim ? fmtDate(dtFim) : 'Atual'}`;
    }

    const body = `
        <p style="font-size:.92rem;font-weight:bold;margin-bottom:12px;color:#333;">
            📋 ${esc(periodo)} (${records.length} registro(s))
        </p>
        ${records.map(r => {
            const { presentes, ausentes } = attendanceLists(r);
            const ul = (arr, ok) => arr.length
                ? arr.map(a => `<li style="color:${ok ? '#15803d' : '#b91c1c'};">${ok ? '✔' : '✖'} ${esc(a.nome)} (${esc(a.apelido || '')})</li>`).join('')
                : '<li style="color:#888;">Nenhum</li>';
            return `
            <div style="page-break-inside:avoid;border:1px solid #d9f99d;padding:10px;border-radius:6px;margin-bottom:12px;background:#fafdf5;">
                <h2 style="margin:0 0 6px;color:#4d7c0f;font-size:.95rem;border-bottom:1px solid #e5e7eb;padding-bottom:3px;">
                    📅 ${fmtDate(r.data)} — ${esc(r.turma)}
                </h2>
                <p style="margin:0 0 8px;font-size:.8rem;color:#444;"><strong>Observações:</strong> ${esc(r.obs || 'Nenhuma')}</p>
                <div class="cols-2" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                    <div>
                        <h4 style="margin:2px 0;color:#15803d;font-size:.82rem;">Presentes (${presentes.length})</h4>
                        <ul style="padding-left:14px;margin:0;font-size:.76rem;">${ul(presentes, true)}</ul>
                    </div>
                    <div>
                        <h4 style="margin:2px 0;color:#b91c1c;font-size:.82rem;">Ausentes (${ausentes.length})</h4>
                        <ul style="padding-left:14px;margin:0;font-size:.76rem;">${ul(ausentes, false)}</ul>
                    </div>
                </div>
            </div>`;
        }).join('')}`;

    return reportShell('Relatório de Chamadas - Prosol Academy', 'portrait', '.8rem',
        'Relatorio_Chamadas_Prosol.pdf', body);
}

function openFilteredAttendancesTab() {
    openReportTab(buildFilteredAttendancesHTML(), 'Nenhuma chamada encontrada no período.');
}

/* --------------------------------------------------------------------------
   9. CHAMADAS
   -------------------------------------------------------------------------- */
function updateAttendanceCounter() {
    const el = $('attendanceCounter');
    if (!el) return;
    const total = document.querySelectorAll('.athlete-checkbox').length;
    if (!total) { el.textContent = ''; return; }
    const marked = document.querySelectorAll('.athlete-checkbox:checked').length;
    el.innerHTML = `<strong>${marked}</strong> / ${total} presentes`;
}

function markAll(state) {
    document.querySelectorAll('.athlete-checkbox').forEach(cb => { cb.checked = state; });
    updateAttendanceCounter();
}

function loadAttendanceList(selectedPresentes) {
    const turma = $('chamadaTurma').value;
    const data = $('chamadaData').value;
    const checklist = $('attendanceChecklist');
    checklist.innerHTML = '';

    if (!turma) {
        checklist.innerHTML = '<p class="empty-msg">Selecione uma turma acima para carregar a lista de atletas.</p>';
        updateAttendanceCounter();
        return;
    }

    // IDs dos que já estavam marcados (resolvidos por nome tolerante)
    const salvosIds = Array.isArray(selectedPresentes)
        ? presentIdSet({ presentes: selectedPresentes }) : new Set();

    let athletes = globalAthletes.filter(a =>
        (a.turma === turma || salvosIds.has(String(a.id))) &&
        (!a.dataCadastro || !data || a.dataCadastro <= data || salvosIds.has(String(a.id)))
    );

    // Salvaguarda: se o corte por data de cadastro esvaziar a lista (bases
    // importadas com data de cadastro futura), mostra todos os da turma.
    if (!athletes.length) athletes = globalAthletes.filter(a => a.turma === turma);

    athletes.sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'));

    if (!athletes.length) {
        checklist.innerHTML = '<p class="empty-msg">Nenhum atleta cadastrado nesta turma até a data selecionada.</p>';
        updateAttendanceCounter();
        return;
    }

    const isEditing = Array.isArray(selectedPresentes);

    checklist.innerHTML = athletes.map(a => {
        const checked = isEditing && salvosIds.has(String(a.id)) ? 'checked' : '';
        return `
        <div class="checklist-item">
            <label>
                <input type="checkbox" value="${esc(a.nome)}" data-id="${esc(a.id)}" class="athlete-checkbox" ${checked} onchange="updateAttendanceCounter()">
                <span class="checklist-name">
                    <strong>${esc(a.nome)}</strong>
                    <small>${esc(a.apelido || '')} • ${fmtDate(a.dataNasc)}</small>
                </span>
            </label>
        </div>`;
    }).join('');

    updateAttendanceCounter();
}

function saveAttendance(event) {
    event.preventDefault();

    const id = $('attendanceId').value;
    const data = $('chamadaData').value;
    const turma = $('chamadaTurma').value;
    const obs = $('chamadaObs').value.trim();

    if (!data || !turma) { toast('Selecione a data e a turma.', 'error'); return; }

    // Grava sempre o nome canônico do cadastro (evita vínculos quebrados)
    const presentes = Array.from(document.querySelectorAll('.athlete-checkbox:checked')).map(cb => {
        const a = globalAthletes.find(x => String(x.id) === cb.dataset.id);
        return a ? a.nome : cb.value;
    });

    const duplicada = globalAttendance.find(r =>
        r.data === data && r.turma === turma && String(r.id) !== String(id));
    if (duplicada && !confirm('Já existe uma chamada para esta turma nesta data. Deseja salvar mesmo assim?')) return;

    // Chamadas usam ID por timestamp — é o padrão já existente na base
    // (ex.: "1785168791917") e não colide entre aparelhos diferentes.
    const record = { id: id || Date.now().toString(), data, turma, obs: obs || '-', presentes };

    if (id) {
        const i = globalAttendance.findIndex(r => String(r.id) === String(id));
        if (i !== -1) globalAttendance[i] = record;
    } else {
        globalAttendance.push(record);
    }

    saveData('attendance', record);
    toast(`Chamada salva! ${presentes.length} presente(s).`);
    cancelAttendanceEdit();
    showTab(2);
}

function editAttendance(id) {
    const r = globalAttendance.find(x => String(x.id) === String(id));
    if (!r) return;

    $('attendanceId').value = r.id;
    $('chamadaData').value = r.data;
    $('chamadaTurma').value = r.turma;
    $('chamadaObs').value = r.obs === '-' ? '' : (r.obs || '');
    $('attendanceFormTitle').textContent = 'Editar Chamada Salva';
    $('btnSaveAttendance').textContent = 'Atualizar Chamada';
    $('btnCancelAttendanceEdit').classList.remove('hidden');

    loadAttendanceList(r.presentes || []);
    closeModal();
    showTab(1);
}

function cancelAttendanceEdit() {
    $('attendanceId').value = '';
    $('attendanceForm').reset();
    $('chamadaObs').value = '';
    $('attendanceFormTitle').textContent = 'Registrar Nova Chamada';
    $('btnSaveAttendance').textContent = 'Salvar Chamada';
    $('btnCancelAttendanceEdit').classList.add('hidden');
    $('attendanceChecklist').innerHTML = '<p class="empty-msg">Selecione a data e a turma acima para carregar a lista de atletas.</p>';
    $('chamadaData').value = todayISO();
    updateAttendanceCounter();
}

function deleteAttendance(id) {
    if (!confirm('Excluir este registro de chamada?')) return;
    globalAttendance = globalAttendance.filter(r => String(r.id) !== String(id));
    deleteAttendanceFromCloud(id);
    closeModal();
    renderAttendanceHistory();
    toast('Chamada excluída.');
}

function getFilteredAttendances() {
    const ini = $('filterDataInicio').value;
    const fim = $('filterDataFim').value;
    let list = [...globalAttendance];
    if (ini) list = list.filter(r => r.data >= ini);
    if (fim) list = list.filter(r => r.data <= fim);
    return list;
}

function clearDateFilter() {
    $('filterDataInicio').value = '';
    $('filterDataFim').value = '';
    renderAttendanceHistory();
}

function renderAttendanceHistory() {
    const tbody = $('attendanceTableBody');
    const records = getFilteredAttendances();

    if (!records.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-msg">Nenhuma chamada encontrada para o período selecionado.</td></tr>';
        return;
    }

    records.sort((a, b) => String(b.data).localeCompare(String(a.data)));

    tbody.innerHTML = records.map(r => `
        <tr>
            <td class="cell-main" data-label="Data"><strong>${fmtDate(r.data)}</strong></td>
            <td data-label="Turma"><span class="turma-badge">${esc(r.turma)}</span></td>
            <td data-label="Presentes"><span style="color:var(--brand);font-weight:700;">${(r.presentes || []).length} presente(s)</span></td>
            <td data-label="Observações"><small style="color:#ccd3ce;">${esc(r.obs || '-')}</small></td>
            <td class="actions-cell" data-label="">
                <button class="btn-action btn-view" onclick="viewAttendance('${esc(r.id)}')">Detalhes</button>
                <button class="btn-action btn-edit" onclick="editAttendance('${esc(r.id)}')">Editar</button>
                <button class="btn-action btn-delete" onclick="deleteAttendance('${esc(r.id)}')">Excluir</button>
            </td>
        </tr>`).join('');
}

function viewAttendance(id) {
    const r = globalAttendance.find(x => String(x.id) === String(id));
    if (!r) return;
    const { presentes, ausentes } = attendanceLists(r);

    const li = (a, ok) => `<li style="color:${ok ? 'var(--brand)' : 'var(--danger)'};margin-bottom:5px;">
        ${ok ? '✔' : '✖'} <strong>${esc(a.nome)}</strong> <small style="color:var(--text-dim)">(${esc(a.apelido || '')}) ${fmtDate(a.dataNasc)}</small></li>`;

    $('modalDetails').innerHTML = `
        <h3>Chamada — ${fmtDate(r.data)}</h3>
        <p style="color:var(--text-dim);margin:6px 0;">Turma: <strong>${esc(r.turma)}</strong></p>
        <p style="color:var(--text-dim);margin-bottom:12px;">Observação: ${esc(r.obs || '-')}</p>
        <button class="primary" style="width:100%;margin-bottom:14px;" onclick="openSingleAttendanceTab('${esc(r.id)}')">🚀 Abrir / Gerar PDF</button>
        <h4 style="color:var(--brand);margin-bottom:6px;">Presentes (${presentes.length})</h4>
        <ul style="list-style:none;padding:0;">${presentes.length ? presentes.map(a => li(a, true)).join('') : '<li style="color:var(--text-mute)">Nenhum.</li>'}</ul>
        <hr style="border:0;border-top:1px dashed var(--line);margin:14px 0;">
        <h4 style="color:var(--danger);margin-bottom:6px;">Ausentes (${ausentes.length})</h4>
        <ul style="list-style:none;padding:0;">${ausentes.length ? ausentes.map(a => li(a, false)).join('') : '<li style="color:var(--text-mute)">Nenhuma falta.</li>'}</ul>`;
    openModal();
}

/* --------------------------------------------------------------------------
   10. RELATÓRIO DE FREQUÊNCIA
   -------------------------------------------------------------------------- */
function pctClass(p) { if (p === null) return ''; return p >= 75 ? 'pct-good' : (p >= 50 ? 'pct-mid' : 'pct-bad'); }

function renderAttendanceReport() {
    const tbody = $('reportTableBody');
    if (!tbody) return;

    const filtro = $('filterTurmaReport') ? $('filterTurmaReport').value : 'TODAS';
    let list = [...globalAthletes];
    if (filtro && filtro !== 'TODAS') list = list.filter(a => a.turma === filtro);
    list.sort((a, b) => (a.turma || '').localeCompare(b.turma || '') || (a.nome || '').localeCompare(b.nome || '', 'pt-BR'));

    if (!list.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-msg">Nenhum atleta cadastrado.</td></tr>';
        return;
    }

    tbody.innerHTML = list.map(a => {
        const s = athleteStats(a);
        return `
        <tr>
            <td class="cell-main" data-label="Atleta"><strong>${esc(a.nome)}</strong></td>
            <td data-label="Turma"><span class="turma-badge">${esc(a.turma)}</span></td>
            <td data-label="Presenças"><strong style="color:var(--brand);">${s.presencas}</strong></td>
            <td data-label="Faltas"><strong style="color:var(--danger);">${s.faltasPos}</strong></td>
            <td data-label="Freq. pós-cadastro"><span class="pct-pill ${pctClass(s.pctPos)}">${pctText(s.pctPos)}</span></td>
            <td data-label="Freq. geral"><span style="color:var(--text-dim);">${pctText(s.pctGeral)}</span></td>
            <td class="actions-cell" data-label="">
                <button class="btn-action btn-view" onclick="viewAthleteDates('${esc(a.id)}')">🔍 Ver dias</button>
            </td>
        </tr>`;
    }).join('');
}

function viewAthleteDates(athleteId) {
    const a = globalAthletes.find(x => String(x.id) === String(athleteId));
    if (!a) return;

    const s = athleteStats(a);
    const aulas = globalAttendance
        .filter(h => h.turma === a.turma && (!s.corte || h.data >= s.corte))
        .sort((x, y) => String(y.data).localeCompare(String(x.data)));

    let html;
    if (!aulas.length) {
        html = '<p class="empty-msg">Nenhuma aula registrada após o cadastro deste atleta.</p>';
    } else {
        html = '<div style="max-height:52vh;overflow-y:auto;margin-top:10px;">' + aulas.map(aula => {
            const ok = presentIdSet(aula).has(String(a.id));
            return `
            <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;background:var(--surface-2);
                        padding:10px 12px;border-radius:8px;margin-bottom:6px;border-left:4px solid ${ok ? 'var(--brand)' : 'var(--danger)'};">
                <span style="min-width:0;">📅 <strong>${fmtDate(aula.data)}</strong>
                    <small style="color:var(--text-dim);display:block;">${esc(aula.obs && aula.obs !== '-' ? aula.obs : 'Sem observações')}</small>
                </span>
                <span style="font-weight:700;white-space:nowrap;color:${ok ? 'var(--brand)' : 'var(--danger)'};">${ok ? '✔ PRESENTE' : '✖ FALTA'}</span>
            </div>`;
        }).join('') + '</div>';
    }

    $('modalDetails').innerHTML = `
        <h3>🔍 Histórico de Presenças</h3>
        <h4 style="color:var(--brand);margin-top:4px;">${esc(a.nome)}</h4>
        <p style="color:var(--text-dim);font-size:.84rem;">Turma: ${esc(a.turma)} • Cadastro: ${fmtDate(a.dataCadastro)}</p>
        <hr style="border:0;border-top:1px solid var(--line);margin:10px 0;">
        ${html}`;
    openModal();
}

/* --------------------------------------------------------------------------
   11. INICIALIZAÇÃO
   -------------------------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', () => {
    populateTurmaSelects();

    const btn = $('btnEnter');
    if (btn) btn.addEventListener('click', openApp);

    // Fecha o modal ao tocar fora ou apertar ESC
    const modal = $('modal');
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

    // Máscara simples de telefone
    ['telefoneAtleta', 'telefone'].forEach(id => {
        const el = $(id);
        if (!el) return;
        el.addEventListener('input', () => {
            let v = el.value.replace(/\D/g, '').slice(0, 11);
            if (v.length > 6) v = `(${v.slice(0, 2)}) ${v.slice(2, v.length - 4)}-${v.slice(-4)}`;
            else if (v.length > 2) v = `(${v.slice(0, 2)}) ${v.slice(2)}`;
            else if (v.length > 0) v = `(${v}`;
            el.value = v;
        });
    });

    window.addEventListener('online', () => { setSyncStatus('online', 'Online'); loadDataFromSupabase(); });
    window.addEventListener('offline', () => setSyncStatus('offline', 'Offline'));
});

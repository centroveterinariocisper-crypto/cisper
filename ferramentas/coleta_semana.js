// Coleta da SEMANA para a "Lista do dia" — roda na aba do NuvemVet (sistema.nuvemvet.com/admin/...), logado.
// Só LÊ páginas do NuvemVet. Antes de rodar, defina:
//   window.__EXCL = [chaves já listadas nos últimos 120 dias];
//   window.__DIAS = ['AAAA-MM-DD', ...]  // os dias de trabalho da semana, em ordem (seg a sáb)
// Resultado fica em window.__SEMANA = { gerado_em, base_servicos, dias: { 'AAAA-MM-DD': [itens] } }
// e a função devolve um resumo curto. Pegue cada dia com: JSON.stringify(window.__SEMANA.dias['AAAA-MM-DD'])
(async () => {
  const EXCL = new Set(window.__EXCL || []);
  const TIPOS = new Set(window.__TIPOS || ['vac', 'orc', 'pos', 'par']);
  const DIAS = (window.__DIAS || []).slice().sort();
  if (!DIAS.length) return 'faltou window.__DIAS';
  const D = 864e5;
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const add = (n) => new Date(+hoje + n * D);
  const br = (d) => String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
  const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const pd = (s) => { const m = String(s).match(/(\d{2})[\/-](\d{2})[\/-](\d{4})/); return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null; };
  const di = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const num = (s) => parseFloat(String(s).replace('R$', '').replace(/\./g, '').replace(',', '.')) || 0;
  const doc = async (u) => new DOMParser().parseFromString(await fetch(u).then(r => r.text()), 'text/html');
  const tdx = (tr) => [...tr.querySelectorAll('td')];
  const norm = (s) => String(s || '').trim().replace(/\s+/g, ' ');
  const MORTE = /EUTAN|CORPO|CREMA|NECROP|[ÓO]BITO/i;
  // Atendimento 'grande' (exames, cirurgia ou ticket de R$ 400 ou mais): o Paulo já acompanha pessoalmente, não entra na lista
  const EXAME = /PERFIL|\bEXAME|ULTRASS|RAIO|ECOCARD|ELETROCARD|\bPCR\b|CITOLOG|URINA|HEMOGRAMA|BIOQU|CULTURA|TOMOGRAF|CIRURG|CASTRA|INTERNA/i;
  const TICKET_BOM = 400;
  const primeiro = di(DIAS[0]), ultimo = di(DIAS[DIAS.length - 1]);
  // dia de trabalho para uma data alvo: o primeiro dia da semana >= alvo (antes da semana vai para o primeiro dia)
  const diaPara = (alvo) => { if (alvo <= primeiro) return DIAS[0]; for (const s of DIAS) if (di(s) >= alvo) return s; return null; };
  const junta = (l) => l.length <= 1 ? (l[0] || '') : l.slice(0, -1).join(', ') + ' e ' + l.at(-1);

  // 1) Serviços dos últimos 30 meses
  const sdoc = await doc(`financeiro_servicos.php?acao=relatorio_detalhado&data_inicio=${iso(add(-915))}&data_final=${iso(hoje)}`);
  const stab = [...sdoc.querySelectorAll('table')].sort((a, b) => b.querySelectorAll('tbody tr').length - a.querySelectorAll('tbody tr').length)[0];
  const S = [];
  for (const tr of stab ? stab.querySelectorAll('tbody tr') : []) {
    const c = tdx(tr).map(x => norm(x.textContent));
    if (c.length < 13) continue;
    const d = pd(c[0]); if (!d) continue;
    S.push({ d, svc: c[2], cid: c[3], cli: c[4], an: c[5], v: num(c[12]) });
  }
  if (!S.length) return 'NuvemVet não devolveu serviços (base_servicos=0)';
  const morto = new Set(S.filter(s => MORTE.test(s.svc)).map(s => s.cid + '|' + s.an.toLowerCase()));
  const cli = new Map();
  for (const s of S) {
    const o = cli.get(s.cid) || { cid: s.cid, nome: s.cli, ult: s.d, total: 0, dias: new Set(), an: new Map() };
    if (s.d > o.ult) o.ult = s.d;
    o.total += s.v; o.dias.add(+s.d);
    const k = s.an.toLowerCase();
    if (s.an && !morto.has(s.cid + '|' + k)) { const prev = o.an.get(k); if (!prev || s.d > prev.d) o.an.set(k, { nome: s.an, d: s.d }); }
    cli.set(s.cid, o);
  }
  // Quem pediu para não receber: anotação na ficha do cliente com "NÃO ENVIAR" (ou parecido)
  const ndoc = await doc('relatorio_clientes_com_anotacoes_registradas.php');
  const BLOQ = new Set();
  for (const tr of ndoc.querySelectorAll('table tbody tr')) { const c = tdx(tr).map(x => norm(x.textContent)); if (c.length >= 3 && /n[ãa]o\s*(enviar|mandar|quer\s*receber)|sem\s*whats|bloquear\s*mensag/i.test(c[2])) BLOQ.add(c[0]); }
  // Quem recebeu mensagem nos últimos 7 dias não recebe outra (exceto o 2º contato do orçamento)
  const RECENT = new Set(window.__RECENTES || []);
  const pode = (cid) => !BLOQ.has(cid) && !RECENT.has(cid);
  const vivoNome = (cid) => { const o = cli.get(cid); if (!o) return ''; const a = [...o.an.values()].sort((x, y) => y.d - x.d); return a.length ? a[0].nome : ''; };
  const itens = []; // cada item tem .dia

  // 2) Vacinas: retornos de 14 dias atrás até 3 dias depois do fim da semana; aviso 3 dias antes do vencimento
  const vdoc = TIPOS.has('vac') ? await doc(`relatorios_vacinas_retorno.php?data_inicio=${br(add(-14))}&data_final=${br(new Date(+ultimo + 3 * D))}&nome_proprietario=&nome_animal=&veterinario=-1&lido_retorno=-1&avisado_pelo_whats=-1&aplicada_retorno=-1`) : new DOMParser().parseFromString('', 'text/html');
  const vacs = [];
  for (const tr of vdoc.querySelectorAll('table tbody tr')) {
    const t = tdx(tr); if (t.length < 9) continue;
    const ret = pd(t[1].textContent); if (!ret) continue;
    const ids = tr.innerHTML.match(/id_cliente=(\d+)[^"]*?id_animal=(\d+)/);
    const vac = (tr.innerHTML.match(/id_vacina="(\d+)"/) || tr.innerHTML.match(/[?&]id=(\d+)/) || [])[1];
    const avisado = tr.querySelector('input.avisado_pelo_whats')?.checked;
    const voltou = tr.querySelector('input.aplicada_retorno')?.checked;
    if (!ids || !vac || avisado || voltou) continue;
    const cid = ids[1], an = norm(t[5].textContent), aplic = pd(t[7].textContent);
    if (morto.has(cid + '|' + an.toLowerCase()) || !pode(cid)) continue;
    const k = 'vac-' + vac; if (EXCL.has(k)) continue;
    const ja = S.some(s => s.cid === cid && s.an.toLowerCase() === an.toLowerCase() && /VACINA|V8|V10|V4|V3|V5|RAIVA|GRIPE|FELV|GIARD/i.test(s.svc) && aplic && s.d > aplic && s.d >= new Date(+ret - 30 * D));
    if (ja) continue;
    const dia = diaPara(new Date(+ret - 3 * D)); if (!dia) continue;
    vacs.push({ k, cid, c: norm(t[4].textContent), a: an, x: norm(t[6].textContent), ret, dia });
  }
  const vg = new Map();
  for (const v of vacs) {
    const gk = v.cid + '|' + v.dia;
    const g = vg.get(gk) || { k: 'vacc-' + v.cid + '-' + v.dia.replace(/-/g, ''), ks: [], t: 'vac', cid: v.cid, c: v.c, an: [], vx: [], ret: v.ret, dia: v.dia };
    g.ks.push(v.k);
    if (!g.an.includes(v.a)) g.an.push(v.a);
    if (!g.vx.includes(v.x)) g.vx.push(v.x);
    if (v.ret < g.ret) g.ret = v.ret;
    vg.set(gk, g);
  }
  for (const g of vg.values()) itens.push({ dia: g.dia, k: g.k, ks: g.ks, t: 'vac', cid: g.cid, c: g.c, a: junta(g.an), ans: g.an, x: junta(g.vx), d: br(g.ret), atraso: Math.round((di(g.dia) - g.ret) / D), n: g.an.length });

  // 3) Orçamentos já feitos: contato no 2º e no 7º dia, se cair na semana
  const odoc = TIPOS.has('orc') ? await doc(`relatorio_orcamentos.php?data_inicio=${br(add(-12))}&data_final=${br(hoje)}`) : new DOMParser().parseFromString('', 'text/html');
  for (const tr of odoc.querySelectorAll('table tbody tr')) {
    const t = tdx(tr); if (t.length < 7) continue;
    const dt = pd(t[2].textContent); if (!dt) continue;
    const idb = (tr.innerHTML.match(/id_budget=(\d+)/) || [])[1];
    const cid = (tr.innerHTML.match(/id_cliente=(\d+)/) || [])[1];
    if (!idb || !cid || BLOQ.has(cid)) continue;
    const an = norm(t[1].textContent);
    if (morto.has(cid + '|' + an.toLowerCase())) continue;
    const valor = num(t[5].textContent);
    const depois = S.filter(s => s.cid === cid && s.d >= dt);
    const pago = depois.reduce((a, s) => a + s.v, 0);
    if (pago >= 0.5 * valor || pago >= TICKET_BOM || depois.some(s => EXAME.test(s.svc))) continue;
    for (const fase of [2]) {
      const alvo = new Date(+dt + fase * D);
      if (alvo < new Date(+primeiro - 2 * D) || alvo > ultimo) continue;
      const k = 'orc' + fase + '-' + idb; if (EXCL.has(k)) continue;
      const dia = diaPara(alvo); if (!dia) continue;
      const igual = itens.find(i => i.t === 'orc' + fase && i.cid === cid && i.dia === dia);
      if (igual) { igual.ks.push(k); if (valor > igual.v) { igual.v = valor; igual.x = norm(t[4].textContent) + ' itens'; } if (!igual.a.split(' e ').includes(an)) igual.a += ' e ' + an; continue; }
      itens.push({ dia, k, ks: [k], t: 'orc' + fase, cid, c: norm(t[0].textContent), a: an, v: valor, x: norm(t[4].textContent) + ' itens', d: br(dt), val: norm(t[3].textContent) });
    }
  }

  // 3b) Pós-atendimento: consulta, aplicação, curativo, fluido ou cirurgia nos últimos 4 dias; mensagem 2 dias depois
  if (TIPOS.has('pos')) {
    const CLIN = /CONSULTA|APLICA|CURATIVO|FLUIDO|CIRURG|CASTRA|SEDA|ANESTES/i;
    const visitas = new Map();
    for (const s of S) {
      if (s.d < add(-4) || !CLIN.test(s.svc)) continue;
      const key = s.cid + '|' + iso(s.d);
      const v = visitas.get(key) || { cid: s.cid, c: s.cli, d: s.d, an: [], interna: false, cir: false };
      if (s.an && !v.an.includes(s.an) && !morto.has(s.cid + '|' + s.an.toLowerCase())) v.an.push(s.an);
      if (/INTERNA/i.test(s.svc)) v.interna = true;
      if (/CIRURG|CASTRA/i.test(s.svc)) v.cir = true;
      if (EXAME.test(s.svc)) v.grande = true;
      v.total = (v.total || 0) + s.v;
      visitas.set(key, v);
    }
    for (const v of visitas.values()) {
      // cirurgia/castração: sempre pergunta como está; nos outros, exame ou ticket alto fica com o Paulo
      if (!v.an.length || !pode(v.cid)) continue;
      if (!v.cir && (v.interna || v.grande || v.total >= TICKET_BOM)) continue;
      if (S.some(s => s.cid === v.cid && s.d > v.d)) continue; // voltou depois
      if (S.some(s => s.cid === v.cid && s.d >= v.d && MORTE.test(s.svc))) continue;
      const k = 'pos-' + v.cid + '-' + iso(v.d).replace(/-/g, ''); if (EXCL.has(k)) continue;
      const dia = diaPara(new Date(+v.d + 2 * D)); if (!dia) continue;
      if (itens.some(i => i.cid === v.cid && i.dia === dia)) continue;
      itens.push({ dia, k, ks: [k], t: 'pos', cid: v.cid, c: v.c, a: junta(v.an), ans: v.an, n: v.an.length, d: br(v.d), x: v.cir ? 'cirurgia' : 'atendimento' });
    }
  }

  // 4) Clientes parados: 20 por dia, maior gasto primeiro
  const ocupados = new Set(itens.map(i => i.cid));
  const parados = !TIPOS.has('par') ? [] : [...cli.values()]
    .filter(o => o.ult < add(-180) && o.ult >= add(-730) && !ocupados.has(o.cid) && !EXCL.has('par-' + o.cid) && !EXCL.has('cid-' + o.cid) && pode(o.cid) && o.an.size > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, DIAS.length * 20 + 30);
  const parItens = parados.map(o => ({ k: 'par-' + o.cid, t: 'par', cid: o.cid, c: o.nome, a: vivoNome(o.cid), v: Math.round(o.total), x: o.dias.size + (o.dias.size === 1 ? ' visita' : ' visitas'), d: br(o.ult) }));

  // 5) Telefone e conferência de óbito na ficha
  const fichas = new Map();
  for (const cid of [...new Set([...itens, ...parItens].map(i => i.cid))]) {
    try {
      const p = await doc(`visualizar_perfil_completo_cliente.php?id_cliente=${cid}`);
      const txt = norm(p.body.textContent);
      const tel = ((txt.match(/Celular:\s*([()\d\s-]{8,})/) || [])[1] || '').replace(/\D/g, '');
      const obitos = [...p.querySelectorAll('.card')].filter(c => /[óÓ]bito:\s*Sim/i.test(norm(c.textContent))).map(c => norm(c.querySelector('h5')?.textContent).toLowerCase());
      fichas.set(cid, { tel, obitos });
    } catch (e) { fichas.set(cid, { tel: '', obitos: [] }); }
  }
  // Sexo dos animais, para escrever 'do'/'da' nas mensagens (g: f, m, x = misto, ? = sem dado)
  const adoc = await doc(`relatorio_animais_cadastrados.php?page=relatorio_animais_lista&data_inicio=01/01/2010&data_final=${br(hoje)}`);
  const SX = new Map();
  for (const tr of adoc.querySelectorAll('table tbody tr')) { const t = tdx(tr); const cid = (tr.innerHTML.match(/id_cliente=(\d+)/) || [])[1]; if (!cid || t.length < 5) continue; const sx = norm(t[4].textContent); SX.set(cid + '|' + norm(t[2].textContent).toLowerCase(), /^f/i.test(sx) ? 'f' : /^m/i.test(sx) ? 'm' : '?'); }
  const gen = (cid, a) => { const gs = new Set(String(a || '').split(/,| e /).map(x => x.trim()).filter(Boolean).map(n => SX.get(cid + '|' + n.toLowerCase()) || '?')); return gs.has('?') || !gs.size ? '?' : gs.size === 1 ? [...gs][0] : 'x'; };
  const fone = (t) => t.length >= 10 ? (t.startsWith('55') && t.length >= 12 ? t : '55' + t) : '';
  const dias = Object.fromEntries(DIAS.map(s => [s, []]));
  for (const i of itens) {
    const f = fichas.get(i.cid) || { tel: '', obitos: [] };
    if (i.ans) { const vivos = i.ans.filter(n => !f.obitos.includes(n.toLowerCase())); delete i.ans; if (!vivos.length) continue; i.a = junta(vivos); i.n = vivos.length; }
    else if (i.a && f.obitos.includes(i.a.toLowerCase())) continue;
    i.tel = fone(f.tel); i.g = gen(i.cid, i.a);
    const dia = i.dia; delete i.dia;
    dias[dia].push(i);
  }
  let di_ = 0, n = 0;
  for (const i of parItens) {
    const f = fichas.get(i.cid) || { tel: '', obitos: [] };
    if (i.a && f.obitos.includes(i.a.toLowerCase())) continue;
    if (di_ >= DIAS.length) break;
    i.tel = fone(f.tel); i.g = gen(i.cid, i.a);
    dias[DIAS[di_]].push(i);
    if (++n === 20) { n = 0; di_++; }
  }
  window.__SEMANA = { gerado_em: new Date().toISOString(), base_servicos: S.length, dias };
  const resumo = {};
  for (const s of DIAS) { const c = {}; for (const i of dias[s]) c[i.t] = (c[i.t] || 0) + 1; resumo[s] = { c, chars: JSON.stringify(dias[s]).length }; }
  return JSON.stringify({ base_servicos: S.length, resumo });
})()

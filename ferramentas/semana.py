"""Monta e publica a lista da semana sem a senha do Paulo (tarefa agendada) — ou com ela.

1) python3 semana.py preparar <dados.enc> <chave>
   Abre a lista publicada e grava estado.json. Imprime uma linha JSON com:
   dias (dias novos a coletar: de amanhã até sábado), excl (chaves já listadas nos últimos 120 dias)
   e recentes (clientes que já têm mensagem nos últimos 7 dias ou nos dias que continuam na lista).
   <chave> = conteúdo da chave da automação (ou a senha do adm).

2) No NuvemVet: window.__EXCL = excl; window.__RECENTES = recentes; window.__DIAS = dias;
   window.__VAC_DIAS = 365; rode coleta_semana.js e salve window.__SEMANA.dias em coletado.json.
   Rode receitas.js (desde a data em estado.json "rx_desde"), confira as doses e grave alertas_novos.json
   (lista, pode ser vazia).

3) python3 semana.py publicar <dados.enc> <chave> coletado.json alertas_novos.json
   Junta com o que já estava publicado (o dia de hoje e os dias que continuam ficam como estavam,
   com as marcações delas), espalha as vacinas atrasadas, guarda o histórico e os avisos antigos
   (45 dias) e regrava <dados.enc>. Depois é só fazer commit e push.
"""
import base64, datetime as dt, json, os, sys, tempfile
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from publicar import vaga_adm, main as publicar_main

d64 = base64.b64decode
HOJE = dt.date.today()


def abrir(caminho, chave):
    n, k, vaga, env = vaga_adm(caminho, chave)
    corpo = json.loads(AESGCM(d64(vaga["k"])).decrypt(d64(env["iv"]), d64(env["ct"]), None))
    alertas = []
    if env.get("adm") and vaga.get("ka"):
        alertas = json.loads(AESGCM(d64(vaga["ka"])).decrypt(d64(env["adm"]["iv"]), d64(env["adm"]["ct"]), None))
    return corpo, alertas


def chaves(i):
    return set((i.get("ks") or []) + [i["k"]])


def dias_novos():
    d, out = HOJE + dt.timedelta(days=1), []
    if d.weekday() == 6:  # amanhã é domingo: monta a semana seguinte inteira
        d += dt.timedelta(days=1)
    while True:
        if d.weekday() != 6:
            out.append(d.isoformat())
        if d.weekday() == 5:
            return out
        d += dt.timedelta(days=1)


def historico(corpo):
    h = dict(corpo.get("historico") or {})
    for dia, itens in (corpo.get("dias") or {}).items():
        for i in itens:
            for k in chaves(i):
                h.setdefault(k, dia)
            h.setdefault("cid-dia-" + i["cid"] + "-" + dia, dia)
    limite = (HOJE - dt.timedelta(days=150)).isoformat()
    return {k: v for k, v in h.items() if v >= limite}


def preparar(caminho, chave):
    corpo, alertas = abrir(caminho, chave)
    h = historico(corpo)
    novos = dias_novos()
    c120 = (HOJE - dt.timedelta(days=120)).isoformat()
    c7 = (HOJE - dt.timedelta(days=7)).isoformat()
    excl = sorted(k for k, v in h.items() if v >= c120 and not k.startswith("cid-dia-"))
    recentes = set()
    for k, v in h.items():
        if k.startswith("cid-dia-") and v >= c7:
            recentes.add(k.split("-")[2])
    gerado = (corpo.get("gerado_em") or "")[:10]
    rx_desde = max(gerado or (HOJE - dt.timedelta(days=7)).isoformat(), (HOJE - dt.timedelta(days=14)).isoformat())
    json.dump({"dias_novos": novos, "rx_desde": rx_desde}, open("estado.json", "w"))
    print(json.dumps({"dias": novos, "excl": excl, "recentes": sorted(recentes),
                      "rx_de": dt.date.fromisoformat(rx_desde).strftime("%d-%m-%Y"), "rx_ate": HOJE.strftime("%d-%m-%Y")}))


def publicar(caminho, chave, coletado, alertas_novos):
    corpo, alertas = abrir(caminho, chave)
    velho = corpo.get("dias") or {}
    novo_col = json.load(open(coletado, encoding="utf-8"))
    novo_col = novo_col.get("dias", novo_col) if isinstance(novo_col, dict) and "dias" in novo_col and isinstance(novo_col["dias"], dict) else novo_col
    novos = sorted(novo_col)
    hoje = HOJE.isoformat()
    dias = {}
    if hoje in velho:
        dias[hoje] = velho[hoje]  # o dia de hoje continua como está (marcações delas)
    for d in novos:
        dias[d] = list(velho.get(d, []))
    ja = set().union(*[chaves(i) for l in dias.values() for i in l]) if dias else set()
    cid_dia = {(i["cid"], d) for d, l in dias.items() for i in l}
    # vacinas atrasadas há mais de 14 dias: espalha pelos dias novos, as mais recentes primeiro
    vac_velhas = []
    for d in novos:
        for i in novo_col.get(d, []):
            if chaves(i) & ja:
                continue
            if i["t"] == "vac" and (i.get("atraso") or 0) > 14:
                vac_velhas.append(i)
                continue
            if i["t"] == "par" and any(x["t"] == "par" for x in dias[d]):
                continue  # dia que já tinha clientes sumidos: mantém os de antes
            if (i["cid"], d) in cid_dia:
                continue
            dias[d].append(i); cid_dia.add((i["cid"], d))
    P = lambda s: dt.date(int(s[6:]), int(s[3:5]), int(s[:2]))
    vac_velhas.sort(key=lambda i: P(i["d"]), reverse=True)
    for i in vac_velhas:
        d = min(novos, key=lambda x: (sum(1 for y in dias[x] if y["t"] != "par"), x))
        i = dict(i); i["k"] = "vacc-%s-%s" % (i["cid"], d.replace("-", "")); i["atraso"] = (dt.date.fromisoformat(d) - P(i["d"])).days
        dias[d].append(i)
    # quem não é sumido vem antes dos sumidos; tira sumido que já tem outra mensagem na semana
    outros = {i["cid"] for l in dias.values() for i in l if i["t"] != "par"}
    for d in dias:
        dias[d] = [i for i in dias[d] if i["t"] != "par"] + [i for i in dias[d] if i["t"] == "par" and i["cid"] not in outros]
    h = historico({"historico": corpo.get("historico"), "dias": dias})
    lim = (HOJE - dt.timedelta(days=45))
    def recente(a):
        try:
            return P(a["data"]) >= lim
        except Exception:
            return True
    novos_al = json.load(open(alertas_novos, encoding="utf-8")) if alertas_novos else []
    ids = {a["id"] for a in novos_al}
    todos_al = [a for a in alertas if a["id"] not in ids and recente(a)] + novos_al
    with tempfile.TemporaryDirectory() as t:
        ent, al = os.path.join(t, "s.json"), os.path.join(t, "a.json")
        json.dump({"dias": dias, "historico": h, "manual": corpo.get("manual")}, open(ent, "w"), ensure_ascii=False)
        json.dump(todos_al, open(al, "w"), ensure_ascii=False)
        saida = os.path.join(t, "dados.enc")
        publicar_main(ent, saida, "base=" + caminho, "auto=" + chave, "alertas=" + al)
        open(caminho, "w").write(open(saida).read())
    resumo = {d: {t: sum(1 for i in l if i["t"] == t) for t in sorted({i["t"] for i in l})} for d, l in dias.items()}
    print(json.dumps({"dias": resumo, "avisos_de_receita": len(todos_al), "novos_avisos": len(novos_al)}, ensure_ascii=False))


def manual(caminho, chave, arquivo_manual):
    """Troca o manual (protocolos) que vai criptografado dentro da lista, sem mexer no resto."""
    corpo, alertas = abrir(caminho, chave)
    with tempfile.TemporaryDirectory() as t:
        ent, al, saida = os.path.join(t, "s.json"), os.path.join(t, "a.json"), os.path.join(t, "dados.enc")
        json.dump({"dias": corpo.get("dias") or {}, "historico": corpo.get("historico") or {}, "manual": json.load(open(arquivo_manual, encoding="utf-8"))}, open(ent, "w"), ensure_ascii=False)
        json.dump(alertas, open(al, "w"), ensure_ascii=False)
        publicar_main(ent, saida, "base=" + caminho, "auto=" + chave, "alertas=" + al)
        open(caminho, "w").write(open(saida).read())


if __name__ == "__main__":
    acao, *args = sys.argv[1:]
    {"preparar": preparar, "publicar": publicar, "manual": manual}[acao](*args)

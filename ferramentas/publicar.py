"""Gera dados.enc (lista da semana criptografada) para o app Cisper.

Uso: python3 publicar.py <semana.json> <saida/dados.enc> nome1=senha1 [nome2=senha2 ...]
 ou: python3 publicar.py <semana.json> <saida/dados.enc> base=<dados.enc publicado> adm=<senha do Paulo>
     (só com a senha do Paulo: reaproveita a chave e as senhas da lista já publicada;
      Débora e Duda continuam entrando com as mesmas senhas)
     opcional: alertas=<alertas.json>  avisos de receita SÓ para o administrador
     (vão criptografados com uma chave que existe só na vaga do adm; Débora e Duda não leem)
semana.json = {"AAAA-MM-DD": [itens], ...}

A lista é criptografada uma vez com uma chave aleatória (AES-256-GCM).
Essa chave é guardada uma vez para cada pessoa, protegida pela senha dela (PBKDF2-SHA256).
Quem abre com a própria senha já entra na sua parte da lista.
"""
import base64, json, os, sys, datetime
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes

ITER = 200_000
b = lambda x: base64.b64encode(x).decode()

def vaga_adm(base, senha):
    env = json.load(open(base))
    d = base64.b64decode
    for n, v in enumerate(env["vagas"]):
        k = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=d(v["salt"]), iterations=env["iter"]).derive(senha.encode())
        try:
            vaga = json.loads(AESGCM(k).decrypt(d(v["iv"]), d(v["ct"]), None))
        except Exception:
            continue
        if vaga["quem"] == "adm":
            return n, k, vaga, env
    raise SystemExit("A senha do adm não abre a lista publicada.")

def chave_da_base(base, senha):
    n, k, vaga, env = vaga_adm(base, senha)
    return base64.b64decode(vaga["k"]), env

def main(entrada, saida, *pares):
    dias = json.load(open(entrada, encoding="utf-8"))
    corpo = {"gerado_em": datetime.datetime.now(datetime.timezone.utc).isoformat(), "dias": dias}
    opc = dict(p.split("=", 1) for p in pares)
    base = opc.pop("base", None)
    if base:
        n, k_adm, vaga, env_base = vaga_adm(base, opc["adm"])
        chave = base64.b64decode(vaga["k"])
        iv = os.urandom(12)
        ct = AESGCM(chave).encrypt(iv, json.dumps(corpo, ensure_ascii=False).encode(), None)
        vagas = [dict(v) for v in env_base["vagas"]]
        saida_env = {"v": 2, "iter": env_base["iter"], "vagas": vagas, "iv": b(iv), "ct": b(ct)}
        if "mk" in env_base:
            saida_env["mk"] = env_base["mk"]
        extra = ""
        if opc.get("alertas"):
            alertas = json.load(open(opc["alertas"], encoding="utf-8"))
            if not vaga.get("ka"):  # cria a chave só do adm e guarda dentro da vaga dele
                vaga["ka"] = b(AESGCM.generate_key(bit_length=256))
                iv2 = os.urandom(12)
                vagas[n] = {"salt": env_base["vagas"][n]["salt"], "iv": b(iv2), "ct": b(AESGCM(k_adm).encrypt(iv2, json.dumps(vaga).encode(), None))}
            iv3 = os.urandom(12)
            saida_env["adm"] = {"iv": b(iv3), "ct": b(AESGCM(base64.b64decode(vaga["ka"])).encrypt(iv3, json.dumps(alertas, ensure_ascii=False).encode(), None))}
            extra = f", {len(alertas)} avisos de receita só para o adm"
        json.dump(saida_env, open(saida, "w"))
        print("ok", sum(len(v) for v in dias.values()), "itens em", len(dias), "dias, senhas da lista publicada mantidas" + extra)
        return
    chave = AESGCM.generate_key(bit_length=256)
    iv = os.urandom(12)
    ct = AESGCM(chave).encrypt(iv, json.dumps(corpo, ensure_ascii=False).encode(), None)
    vagas = []
    for par in pares:
        nome, senha = par.split("=", 1)
        salt, iv2 = os.urandom(16), os.urandom(12)
        k = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=ITER).derive(senha.encode())
        conteudo = json.dumps({"quem": nome, "k": b(chave)}).encode()
        vagas.append({"salt": b(salt), "iv": b(iv2), "ct": b(AESGCM(k).encrypt(iv2, conteudo, None))})
    json.dump({"v": 2, "iter": ITER, "vagas": vagas, "iv": b(iv), "ct": b(ct)}, open(saida, "w"))
    print("ok", sum(len(v) for v in dias.values()), "itens em", len(dias), "dias,", len(vagas), "senhas")

if __name__ == "__main__":
    main(*sys.argv[1:])

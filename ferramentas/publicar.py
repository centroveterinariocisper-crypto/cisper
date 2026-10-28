"""Gera dados.enc (lista da semana criptografada) para o app Cisper.

Uso: python3 publicar.py <semana.json> <saida/dados.enc> nome1=senha1 [nome2=senha2 ...]
 ou: python3 publicar.py <semana.json> <saida/dados.enc> base=<dados.enc publicado> adm=<senha do Paulo>
     (só com a senha do Paulo: reaproveita a chave e as senhas da lista já publicada;
      Débora e Duda continuam entrando com as mesmas senhas)
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

def chave_da_base(base, senha):
    env = json.load(open(base))
    d = base64.b64decode
    for v in env["vagas"]:
        k = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=d(v["salt"]), iterations=env["iter"]).derive(senha.encode())
        try:
            vaga = json.loads(AESGCM(k).decrypt(d(v["iv"]), d(v["ct"]), None))
        except Exception:
            continue
        if vaga["quem"] == "adm":
            return d(vaga["k"]), env
    raise SystemExit("A senha do adm não abre a lista publicada.")

def main(entrada, saida, *pares):
    dias = json.load(open(entrada, encoding="utf-8"))
    corpo = {"gerado_em": datetime.datetime.now(datetime.timezone.utc).isoformat(), "dias": dias}
    opc = dict(p.split("=", 1) for p in pares)
    base = opc.pop("base", None)
    if base:
        chave, env_base = chave_da_base(base, opc["adm"])
        iv = os.urandom(12)
        ct = AESGCM(chave).encrypt(iv, json.dumps(corpo, ensure_ascii=False).encode(), None)
        saida_env = {"v": 2, "iter": env_base["iter"], "vagas": env_base["vagas"], "iv": b(iv), "ct": b(ct)}
        if "mk" in env_base:
            saida_env["mk"] = env_base["mk"]
        json.dump(saida_env, open(saida, "w"))
        print("ok", sum(len(v) for v in dias.values()), "itens em", len(dias), "dias, senhas da lista publicada mantidas")
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

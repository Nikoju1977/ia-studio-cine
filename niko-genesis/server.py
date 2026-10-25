#!/usr/bin/env python3
"""NIKO STUDIO / CINÉ GENESIS — optional self-hosted AI bridge (stdlib only).

Keep Ollama and ComfyUI bound to localhost. For phones use a trusted VPN or
HTTPS reverse proxy with authentication. No raw provider tokens in web files.
"""
import base64
import json
import os
from pathlib import Path
import re
import secrets
import urllib.parse
import urllib.request
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

BASE=Path(__file__).resolve().parent
HOST=os.environ.get("HOST","127.0.0.1")
PORT=int(os.environ.get("PORT","8765"))
TOKEN=os.environ.get("NIKO_STUDIO_TOKEN","")
OLLAMA=os.environ.get("OLLAMA_URL","http://127.0.0.1:11434").rstrip("/")
MODEL=os.environ.get("OLLAMA_MODEL","qwen2.5:7b")
COMFY=os.environ.get("COMFY_URL","http://127.0.0.1:8188").rstrip("/")
LIMIT=10_000_000
PREFIX="/niko-genesis"
FILES={"index.html","manifest.webmanifest","sw.js"}

def request_json(url,payload=None,timeout=120):
    data=None if payload is None else json.dumps(payload).encode()
    req=urllib.request.Request(url,data=data,headers={"Content-Type":"application/json","User-Agent":"NikoStudio/1.0"})
    with urllib.request.urlopen(req,timeout=timeout) as res:
        return json.loads(res.read(25_000_000))

def fill(value,mapping):
    if isinstance(value,dict):return {k:fill(v,mapping) for k,v in value.items()}
    if isinstance(value,list):return [fill(v,mapping) for v in value]
    if isinstance(value,str):
        if value in mapping:return mapping[value]
        for k,v in mapping.items():
            if isinstance(v,str):value=value.replace(k,v)
    return value

def upload(uri):
    m=re.fullmatch(r"data:image/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)",uri or "")
    if not m:raise ValueError("Image base64 PNG/JPEG/WebP requise")
    b=base64.b64decode(m[2],validate=True)
    if len(b)>8_000_000:raise ValueError("Image >8 Mo")
    name="niko_"+secrets.token_hex(10)+("."+"jpg" if m[1]=="jpeg" else "."+m[1])
    boundary="----Niko"+secrets.token_hex(8)
    body=("--"+boundary+"\r\nContent-Disposition: form-data; name=\"image\"; filename=\""+name+"\"\r\nContent-Type: image/"+m[1]+"\r\n\r\n").encode()+b+("\r\n--"+boundary+"--\r\n").encode()
    req=urllib.request.Request(COMFY+"/upload/image",data=body,headers={"Content-Type":"multipart/form-data; boundary="+boundary},method="POST")
    with urllib.request.urlopen(req,timeout=90) as r:
        return json.loads(r.read())["name"]

def launch(d):
    mode=d.get("mode")
    if mode not in ("image","video"):raise ValueError("Mode image/vidéo requis")
    path=BASE/"workflows"/(mode+"_api.json")
    if not path.is_file():raise ValueError("Workflow manquant : "+path.name)
    wf=json.loads(path.read_text())
    if not isinstance(wf,dict):raise ValueError("Workflow ComfyUI API attendu")
    ratio=d.get("ratio","16:9")
    width,height={"16:9":(1024,576),"9:16":(576,1024),"1:1":(768,768)}.get(ratio,(1024,576))
    first=d.get("first_image")
    if mode=="video" and not first:raise ValueError("Image de départ requise")
    image=upload(first) if first else ""
    mapping={"__PROMPT__":str(d.get("prompt",""))[:10000],"__NEGATIVE__":"watermark, text, logos","__IMAGE__":image,"__SEED__":secrets.randbelow(2147483647),"__WIDTH__":width,"__HEIGHT__":height}
    out=request_json(COMFY+"/prompt",{"prompt":fill(wf,mapping),"client_id":"niko-studio"},timeout=90)
    if not out.get("prompt_id"):raise ValueError("ComfyUI n'a pas renvoyé d'identifiant")
    return {"prompt_id":out["prompt_id"]}

def job_state(key):
    if not re.fullmatch(r"[a-zA-Z0-9_-]{6,100}",key):raise ValueError("Identifiant invalide")
    d=request_json(COMFY+"/history/"+urllib.parse.quote(key),timeout=15).get(key)
    if not d:return {"state":"running","assets":[]}
    state=d.get("status",{})
    if state.get("status_str") in ("error","failed","cancelled"):return {"state":"error","error":"ComfyUI a échoué"}
    assets=[]
    for output in (d.get("outputs") or {}).values():
        for kind in ("images","gifs","videos"):
            for asset in (output.get(kind) or []):
                if isinstance(asset,dict) and asset.get("filename"):
                    assets.append({k:asset.get(k,"") for k in ("filename","subfolder","type")})
    return {"state":"done","assets":assets}

class Handler(BaseHTTPRequestHandler):
    server_version="NikoStudio/1.0"
    def send_json(self,data,status=200):
        raw=json.dumps(data,ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type","application/json; charset=utf-8")
        self.send_header("Cache-Control","no-store")
        self.send_header("X-Content-Type-Options","nosniff")
        self.send_header("Content-Length",str(len(raw)))
        self.end_headers();self.wfile.write(raw)
    def allowed(self):
        if TOKEN and not secrets.compare_digest(self.headers.get("Authorization",""),"Bearer "+TOKEN):
            self.send_json({"error":"Jeton invalide"},401);return False
        return True
    def do_GET(self):
        u=urllib.parse.urlsplit(self.path)
        path=u.path
        if path in ("/",PREFIX):
            self.send_response(302);self.send_header("Location",PREFIX+"/");self.end_headers();return
        if path.startswith(PREFIX+"/api/"):
            if not self.allowed():return
            try:
                args=urllib.parse.parse_qs(u.query)
                if path==PREFIX+"/api/health":
                    connected={}
                    for kind,url in (("ollama",OLLAMA+"/api/tags"),("comfyui",COMFY+"/system_stats")):
                        try:request_json(url,timeout=2);connected[kind]=True
                        except Exception:connected[kind]=False
                    return self.send_json({"connected":connected,"model":MODEL,"workflows":{x:(BASE/"workflows"/(x+"_api.json")).exists() for x in ("image","video")}})
                if path==PREFIX+"/api/comfy/status":
                    return self.send_json(job_state(args.get("id",[""])[0]))
                if path==PREFIX+"/api/comfy/asset":
                    name=args.get("filename",[""])[0]
                    folder=args.get("subfolder",[""])[0]
                    kind=args.get("type",["output"])[0]
                    if not name or len(name)>255 or "/" in name or "\\" in name or name.startswith("."):raise ValueError("Nom de fichier invalide")
                    if folder.startswith("/") or ".." in folder or "\\" in folder:raise ValueError("Dossier invalide")
                    if kind not in ("output","temp"):raise ValueError("Type invalide")
                    url=COMFY+"/view?"+urllib.parse.urlencode({"filename":name,"subfolder":folder,"type":kind})
                    with urllib.request.urlopen(url,timeout=60) as res:
                        size=int(res.headers.get("Content-Length","0") or 0)
                        if size>120_000_000:raise ValueError("Vidéo >120 Mo")
                        body=res.read(120_000_001)
                        if len(body)>120_000_000:raise ValueError("Vidéo >120 Mo")
                        content_type=res.headers.get("Content-Type","application/octet-stream").split(";")[0]
                    self.send_response(200)
                    self.send_header("Content-Type",content_type)
                    self.send_header("Content-Length",str(len(body)))
                    self.send_header("Cache-Control","no-store")
                    self.end_headers();self.wfile.write(body);return
                return self.send_json({"error":"Route API inconnue"},404)
            except Exception as exc:return self.send_json({"error":str(exc)[:400]},400 if isinstance(exc,ValueError) else 502)
        relative=path.removeprefix(PREFIX+"/")
        if relative==path:return self.send_error(404)
        if not relative:relative="index.html"
        if relative not in FILES:return self.send_error(404)
        file=BASE/relative
        if not file.is_file():return self.send_error(404)
        raw=file.read_bytes()
        mime="text/html" if relative=="index.html" else ("text/javascript" if relative=="sw.js" else "application/manifest+json")
        self.send_response(200)
        self.send_header("Content-Type",mime+"; charset=utf-8")
        self.send_header("Content-Length",str(len(raw)))
        self.send_header("X-Content-Type-Options","nosniff")
        self.send_header("Referrer-Policy","no-referrer")
        self.send_header("X-Frame-Options","DENY")
        self.end_headers();self.wfile.write(raw)
    def do_POST(self):
        if not urllib.parse.urlsplit(self.path).path.startswith(PREFIX+"/api/"):return self.send_error(404)
        if not self.allowed():return
        try:
            length=int(self.headers.get("Content-Length","0"))
            if length<1 or length>LIMIT:raise ValueError("Requête trop volumineuse")
            d=json.loads(self.rfile.read(length))
            if not isinstance(d,dict):raise ValueError("JSON objet attendu")
            path=urllib.parse.urlsplit(self.path).path
            if path==PREFIX+"/api/ai":
                prompt=str(d.get("prompt",""))[:24000]
                if not prompt:raise ValueError("Prompt vide")
                system=str(d.get("system","Tu es scénariste. JSON uniquement."))[:5000]
                doc=request_json(OLLAMA+"/api/chat",{"model":MODEL,"messages":[{"role":"system","content":system},{"role":"user","content":prompt}],"stream":False,"format":"json"},timeout=300)
                content=doc.get("message",{}).get("content","")
                return self.send_json({"result":json.loads(content)})
            if path==PREFIX+"/api/comfy/start":return self.send_json(launch(d))
            return self.send_json({"error":"Route inconnue"},404)
        except Exception as exc:return self.send_json({"error":str(exc)[:400]},400 if isinstance(exc,(ValueError,FileNotFoundError,json.JSONDecodeError)) else 502)

if __name__=="__main__":
    if HOST not in ("127.0.0.1","localhost") and not TOKEN:
        raise SystemExit("NIKO_STUDIO_TOKEN est obligatoire sur réseau")
    print("NIKO STUDIO : http://"+HOST+":"+str(PORT)+PREFIX+"/",flush=True)
    ThreadingHTTPServer((HOST,PORT),Handler).serve_forever()

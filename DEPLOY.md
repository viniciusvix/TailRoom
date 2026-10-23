# Deploy com Podman

## Supabase e Google

1. Crie um projeto no Supabase e execute `supabase/schema.sql` no SQL Editor.
2. Em Authentication > Providers, habilite Google e configure o Client ID/Secret do Google Cloud.
3. Em Authentication > URL Configuration, adicione a URL pública do app e o callback `https://SEU-PROJETO.supabase.co/auth/v1/callback`.
4. Crie um arquivo `.env.local` (não versione) com:

```env
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-anon-publica
```

Use somente a chave `anon` no frontend. A `service_role` nunca deve ser exposta no navegador.

## Build

```powershell
podman build -t tailroom:latest --build-arg VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co --build-arg VITE_SUPABASE_ANON_KEY=sua-chave-anon-publica .
```

## Executar

```powershell
podman run -d --replace --name tailroom -p 5173:80 localhost/tailroom:latest
```

Acesse `http://127.0.0.1:5173/`.

## Verificar

```powershell
podman ps
Invoke-WebRequest http://127.0.0.1:5173/healthz
```

## Parar e remover

```powershell
podman stop tailroom
podman rm tailroom
```

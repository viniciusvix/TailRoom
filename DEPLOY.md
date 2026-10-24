# Deploy com Podman

## Supabase e Google

O passo a passo completo está em [README.md › Configuração do Supabase](README.md#configuração-do-supabase). Resumo:

1. Execute `supabase/schema.sql` no SQL Editor (idempotente; rode de novo a cada atualização do schema).
2. Em Authentication > Sign In / Providers, habilite Google (Client ID/Secret) e Email (com *Confirm email*).
3. Configure um SMTP próprio para os e-mails de confirmação e de redefinição de senha.
4. Em Authentication > URL Configuration, defina o Site URL e adicione a URL pública do app em Redirect URLs. No Google Cloud, cadastre o callback `https://SEU-PROJETO.supabase.co/auth/v1/callback`.
5. Crie um arquivo `.env.local` (não versione) com:

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

function readCookie(request, name) {
  const part = (request.headers.get("cookie") || "").split(";").map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`));
  return part ? decodeURIComponent(part.slice(name.length + 1)) : "";
}

async function hasGalleryAccess(request, gallery) {
  if (!gallery.password_hash) return true;
  const token = readCookie(request, `gallery_${gallery.slug}`);
  const [expires, signature] = token.split(".");
  if (!expires || Number(expires) < Date.now()) return false;
  return signature === await digest(`${gallery.password_hash}:${gallery.slug}:${expires}`);
}

function accessPage(gallery, error = "") {
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Accesso · ${escapeHtml(gallery.title)}</title>${globalStyles()}</head><body><main class="admin" style="max-width:520px;padding-top:12vh"><section class="panel"><span class="status">GALLERIA PROTETTA</span><h1>${escapeHtml(gallery.title)}</h1><p>Inserisci la password ricevuta dallo studio.</p><form method="post" action="/g/${escapeHtml(gallery.slug)}/access"><div class="field"><label>PASSWORD</label><input name="password" type="password" required autofocus></div><button class="gold">ENTRA</button></form><p class="danger">${escapeHtml(error)}</p></section></main></body></html>`;
}

async function handleAdminApi(request, env, path) {
  const user = requireUser(request);
  await env.DB.prepare("INSERT OR IGNORE INTO users (id,email,role) VALUES (?,?,?)")
    .bind(user.id, user.email, "admin").run();

  if (path === "/api/admin/galleries" && request.method === "GET") {
    const result = await env.DB.prepare("SELECT * FROM galleries ORDER BY created_at DESC").all();
    return responseJson(result.results || []);
  }

  if (path === "/api/admin/galleries" && request.method === "POST") {
    const body = await request.json();
    const title = String(body.title || "").trim();
    const gallerySlug = makeSlug(body.slug || title);
    if (!title || !gallerySlug) return responseJson({ error: "Titolo non valido" }, 400);
    const id = crypto.randomUUID();
    const passwordHash = body.password ? await digest(String(body.password)) : null;
    await env.DB.prepare("INSERT INTO galleries (id,slug,title,description,event_date,published,download_enabled,password_hash,created_by) VALUES (?,?,?,?,?,?,?,?,?)")
      .bind(id, gallerySlug, title, String(body.description || ""), body.eventDate || null,
        body.published ? 1 : 0, body.downloadEnabled ? 1 : 0, passwordHash, user.id).run();
    return responseJson({ id, slug: gallerySlug }, 201);
  }

  const galleryMatch = path.match(/^\/api\/admin\/galleries\/([^/]+)$/);
  if (galleryMatch && request.method === "PATCH") {
    const body = await request.json();
    const passwordHash = body.password === undefined ? undefined : (body.password ? await digest(String(body.password)) : null);
    const current = await env.DB.prepare("SELECT * FROM galleries WHERE id=?").bind(galleryMatch[1]).first();
    if (!current) return responseJson({ error: "Galleria non trovata" }, 404);
    await env.DB.prepare("UPDATE galleries SET title=?,description=?,event_date=?,published=?,download_enabled=?,password_hash=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
      .bind(String(body.title ?? current.title), String(body.description ?? current.description), body.eventDate ?? current.event_date,
        body.published === undefined ? current.published : (body.published ? 1 : 0),
        body.downloadEnabled === undefined ? current.download_enabled : (body.downloadEnabled ? 1 : 0),
        passwordHash === undefined ? current.password_hash : passwordHash, galleryMatch[1]).run();
    return responseJson({ ok: true });
  }

  if (galleryMatch && request.method === "DELETE") {
    const photos = await env.DB.prepare("SELECT storage_key FROM photos WHERE gallery_id=?").bind(galleryMatch[1]).all();
    for (const photo of photos.results || []) await env.BUCKET.delete(photo.storage_key);
    await env.DB.prepare("DELETE FROM galleries WHERE id=?").bind(galleryMatch[1]).run();
    return responseJson({ ok: true });
  }

  const photosMatch = path.match(/^\/api\/admin\/galleries\/([^/]+)\/photos$/);
  if (photosMatch && request.method === "GET") {
    const result = await env.DB.prepare("SELECT * FROM photos WHERE gallery_id=? ORDER BY sort_order").bind(photosMatch[1]).all();
    return responseJson(result.results || []);
  }

  if (path === "/api/admin/photos" && request.method === "POST") {
    const form = await request.formData();
    const galleryId = String(form.get("galleryId") || "");
    const files = form.getAll("files");
    if (!galleryId || files.length < 1 || files.length > 25) return responseJson({ error: "Caricamento non valido (1–25 file)." }, 400);
    const maximum = await env.DB.prepare("SELECT COALESCE(MAX(sort_order),-1) maximum FROM photos WHERE gallery_id=?").bind(galleryId).first();
    let order = Number(maximum?.maximum || -1) + 1;
    for (const file of files) {
      if (!(file instanceof File) || !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 15 * 1024 * 1024) {
        return responseJson({ error: "Sono accettate immagini JPG, PNG o WebP fino a 15 MB." }, 400);
      }
      const id = crypto.randomUUID();
      const key = `galleries/${galleryId}/${id}-${makeSlug(file.name) || "photo"}`;
      await env.BUCKET.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
      await env.DB.prepare("INSERT INTO photos (id,gallery_id,storage_key,filename,mime_type,sort_order) VALUES (?,?,?,?,?,?)")
        .bind(id, galleryId, key, file.name, file.type, order++).run();
    }
    return responseJson({ ok: true, count: files.length }, 201);
  }

  if (path === "/api/admin/photos/reorder" && request.method === "PUT") {
    const body = await request.json();
    if (!Array.isArray(body.photoIds) || body.photoIds.length > 2000) return responseJson({ error: "Ordine non valido" }, 400);
    await env.DB.batch(body.photoIds.map((id, index) => env.DB.prepare("UPDATE photos SET sort_order=? WHERE id=? AND gallery_id=?")
      .bind(index, id, String(body.galleryId || ""))));
    return responseJson({ ok: true });
  }

  if (path === "/api/admin/settings" && request.method === "PUT") {
    const body = await request.json();
    await env.DB.prepare("UPDATE site_settings SET studio_name=?,contact_email=?,instagram_url=?,copyright_text=?,updated_at=CURRENT_TIMESTAMP WHERE id='default'")
      .bind(String(body.studioName || "NOME STUDIO"), body.contactEmail || null, body.instagramUrl || null, body.copyrightText || null).run();
    return responseJson({ ok: true });
  }

  return responseJson({ error: "Endpoint non trovato" }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    try {
      if (path.startsWith("/api/admin/")) return await handleAdminApi(request, env, path);
      if (path === "/admin") return new Response(adminPage(requireUser(request)), {
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
      });
      if (path === "/") return Response.redirect(new URL("/g/serata-villa/view-night", request.url), 302);

      const accessMatch = path.match(/^\/g\/([a-z0-9-]+)\/access$/);
      if (accessMatch && request.method === "POST") {
        const item = await readGallery(env, accessMatch[1], false);
        if (!item) return new Response("Galleria non disponibile", { status: 404 });
        const form = await request.formData();
        if (await digest(String(form.get("password") || "")) !== item.password_hash) {
          return new Response(accessPage(item, "Password non corretta."), { status: 401, headers: { "content-type": "text/html; charset=utf-8" } });
        }
        const expires = Date.now() + 24 * 60 * 60 * 1000;
        const signature = await digest(`${item.password_hash}:${item.slug}:${expires}`);
        return new Response(null, { status: 303, headers: { location: `/g/${item.slug}/view-night`, "set-cookie": `gallery_${item.slug}=${expires}.${signature}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400` } });
      }

      const mediaMatch = path.match(/^\/media\/(.+)$/);
      if (mediaMatch) {
        const key = decodeURIComponent(mediaMatch[1]);
        const item = await env.DB.prepare("SELECT g.* FROM photos p JOIN galleries g ON g.id=p.gallery_id WHERE p.storage_key=?").bind(key).first();
        if (!item || !item.published || !(await hasGalleryAccess(request, item))) return new Response("Not found", { status: 404 });
        const object = await env.BUCKET.get(key);
        if (!object) return new Response("Not found", { status: 404 });
        return new Response(object.body, { headers: { "content-type": object.httpMetadata?.contentType || "application/octet-stream", "cache-control": "private, max-age=3600" } });
      }

      const galleryMatch = path.match(/^\/g\/([a-z0-9-]+)(?:\/view-night)?$/);
      if (galleryMatch) {
        let item = null;
        let settings = null;
        try {
          item = await readGallery(env, galleryMatch[1], false);
          settings = await env.DB.prepare("SELECT * FROM site_settings WHERE id='default'").first();
        } catch {}
        if (!item && galleryMatch[1] === demoGallery.slug) item = demoGallery;
        if (!item) return new Response("Galleria non disponibile", { status: 404 });
        if (!(await hasGalleryAccess(request, item))) return new Response(accessPage(item), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
        return new Response(publicPage(item, settings), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": item.password_hash ? "private, no-store" : "public, max-age=60" } });
      }
      return new Response("Not found", { status: 404 });
    } catch (error) {
      if (error instanceof Response) return error;
      return responseJson({ error: error?.message || "Errore interno" }, 500);
    }
  },
};

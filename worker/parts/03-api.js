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
  const user = await requireAdmin(request, env);
  await env.DB.prepare("INSERT OR REPLACE INTO users (id,email,role,created_at) VALUES (?,?,?,COALESCE((SELECT created_at FROM users WHERE id=?),CURRENT_TIMESTAMP))")
    .bind(user.id, user.email, "admin", user.id).run();

  if (path === "/api/admin/collaborators" && request.method === "GET") {
    const result = await env.DB.prepare("SELECT email,created_at FROM site_admins ORDER BY created_at,email").all();
    return responseJson({ currentEmail: user.email, collaborators: result.results || [] });
  }

  if (path === "/api/admin/collaborators" && request.method === "POST") {
    const body = await request.json();
    const email = String(body.email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return responseJson({ error: "Inserisci un indirizzo e-mail valido." }, 400);
    await env.DB.prepare("INSERT OR IGNORE INTO site_admins (email,added_by) VALUES (?,?)").bind(email, user.id).run();
    return responseJson({ ok: true, email }, 201);
  }

  const collaboratorMatch = path.match(/^\/api\/admin\/collaborators\/(.+)$/);
  if (collaboratorMatch && request.method === "DELETE") {
    const email = decodeURIComponent(collaboratorMatch[1]).trim().toLowerCase();
    if (email === user.email.toLowerCase()) return responseJson({ error: "Non puoi rimuovere l'account con cui sei collegato." }, 400);
    const count = await env.DB.prepare("SELECT COUNT(*) total FROM site_admins").first();
    if (Number(count?.total || 0) <= 1) return responseJson({ error: "Deve restare almeno un amministratore." }, 400);
    await env.DB.prepare("DELETE FROM site_admins WHERE email = ? COLLATE NOCASE").bind(email).run();
    return responseJson({ ok: true });
  }

  if (path === "/api/admin/galleries" && request.method === "GET") {
    const result = await env.DB.prepare("SELECT * FROM galleries ORDER BY created_at DESC").all();
    return responseJson(result.results || []);
  }

  if (path === "/api/admin/galleries" && request.method === "POST") {
    const body = await request.json();
    const title = String(body.title || "").trim();
    const gallerySlug = makeSlug(body.slug || title);
    if (!title || !gallerySlug) return responseJson({ error: "Titolo non valido" }, 400);
    const passwordHash = body.password ? await digest(String(body.password)) : null;
    const existing = await env.DB.prepare("SELECT id FROM galleries WHERE slug=?").bind(gallerySlug).first();
    if (existing) {
      await env.DB.prepare("UPDATE galleries SET title=?,description=?,event_date=?,published=?,download_enabled=?,password_hash=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
        .bind(title, String(body.description || ""), body.eventDate || null, body.published ? 1 : 0,
          body.downloadEnabled ? 1 : 0, passwordHash, existing.id).run();
      return responseJson({ id: existing.id, slug: gallerySlug, reused: true });
    }
    const id = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO galleries (id,slug,title,description,event_date,published,download_enabled,password_hash,created_by) VALUES (?,?,?,?,?,?,?,?,?)")
      .bind(id, gallerySlug, title, String(body.description || ""), body.eventDate || null,
        body.published ? 1 : 0, body.downloadEnabled ? 1 : 0, passwordHash, user.id).run();
    return responseJson({ id, slug: gallerySlug }, 201);
  }

  const galleryMatch = path.match(/^\/api\/admin\/galleries\/([^/]+)$/);
  if (galleryMatch && request.method === "PATCH") {
    const body = await request.json();
    const current = await env.DB.prepare("SELECT * FROM galleries WHERE id=?").bind(galleryMatch[1]).first();
    if (!current) return responseJson({ error: "Galleria non trovata" }, 404);
    const nextSlug = makeSlug(body.slug ?? current.slug);
    if (!nextSlug) return responseJson({ error: "Slug non valido" }, 400);
    const conflict = await env.DB.prepare("SELECT id FROM galleries WHERE slug=? AND id<>?").bind(nextSlug, galleryMatch[1]).first();
    if (conflict) return responseJson({ error: "Questo slug è già usato da un altro evento." }, 409);
    const passwordHash = body.removePassword ? null : (body.password ? await digest(String(body.password)) : current.password_hash);
    await env.DB.prepare("UPDATE galleries SET slug=?,title=?,description=?,event_date=?,published=?,download_enabled=?,password_hash=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
      .bind(nextSlug, String(body.title ?? current.title), String(body.description ?? current.description), body.eventDate ?? current.event_date,
        body.published === undefined ? current.published : (body.published ? 1 : 0),
        body.downloadEnabled === undefined ? current.download_enabled : (body.downloadEnabled ? 1 : 0),
        passwordHash, galleryMatch[1]).run();
    return responseJson({ ok: true, slug: nextSlug });
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

  const coverMatch = path.match(/^\/api\/admin\/galleries\/([^/]+)\/cover$/);
  if (coverMatch && request.method === "PUT") {
    const body = await request.json();
    const photo = await env.DB.prepare("SELECT id FROM photos WHERE id=? AND gallery_id=?").bind(String(body.photoId || ""), coverMatch[1]).first();
    if (!photo) return responseJson({ error: "Fotografia non trovata" }, 404);
    await env.DB.prepare("UPDATE galleries SET cover_photo_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(photo.id, coverMatch[1]).run();
    return responseJson({ ok: true });
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

  const photoMatch = path.match(/^\/api\/admin\/photos\/([^/]+)$/);
  if (photoMatch && request.method === "DELETE") {
    const photo = await env.DB.prepare("SELECT id,gallery_id,storage_key FROM photos WHERE id=?").bind(photoMatch[1]).first();
    if (!photo) return responseJson({ error: "Fotografia non trovata" }, 404);
    await env.BUCKET.delete(photo.storage_key);
    await env.DB.prepare("DELETE FROM photos WHERE id=?").bind(photo.id).run();
    await env.DB.prepare("UPDATE galleries SET cover_photo_id=NULL WHERE id=? AND cover_photo_id=?").bind(photo.gallery_id, photo.id).run();
    return responseJson({ ok: true });
  }

  if (path === "/api/admin/settings" && request.method === "GET") {
    const settings = await env.DB.prepare("SELECT * FROM site_settings WHERE id='default'").first();
    return responseJson(settings || {});
  }

  if (path === "/api/admin/settings" && request.method === "PUT") {
    const body = await request.json();
    await env.DB.prepare("UPDATE site_settings SET studio_name=?,contact_email=?,instagram_url=?,copyright_text=?,accent_color=?,background_color=?,text_color=?,updated_at=CURRENT_TIMESTAMP WHERE id='default'")
      .bind(String(body.studioName || "NOME STUDIO"), body.contactEmail || null, body.instagramUrl || null,
        body.copyrightText || null, safeColor(body.accentColor, "#c9a96e"), safeColor(body.backgroundColor, "#0a0805"),
        safeColor(body.textColor, "#f5f0e8")).run();
    return responseJson({ ok: true });
  }

  if (path === "/api/admin/branding-assets" && request.method === "POST") {
    const form = await request.formData();
    const logo = form.get("logo");
    const intro = form.get("intro");
    const current = await env.DB.prepare("SELECT logo_url,intro_photo_key FROM site_settings WHERE id='default'").first();
    let logoKey = current?.logo_url || null;
    let introKey = current?.intro_photo_key || null;
    if (logo instanceof File && logo.size) {
      if (!["image/png", "image/jpeg", "image/webp", "image/svg+xml"].includes(logo.type) || logo.size > 8 * 1024 * 1024) return responseJson({ error: "Logo non valido. Usa PNG, JPG, WebP o SVG fino a 8 MB." }, 400);
      const next = `branding/logo-${crypto.randomUUID()}-${makeSlug(logo.name) || "logo"}`;
      await env.BUCKET.put(next, logo.stream(), { httpMetadata: { contentType: logo.type } });
      if (logoKey) await env.BUCKET.delete(logoKey);
      logoKey = next;
    }
    if (intro instanceof File && intro.size) {
      if (!["image/png", "image/jpeg", "image/webp"].includes(intro.type) || intro.size > 15 * 1024 * 1024) return responseJson({ error: "Foto introduttiva non valida. Usa JPG, PNG o WebP fino a 15 MB." }, 400);
      const next = `branding/intro-${crypto.randomUUID()}-${makeSlug(intro.name) || "intro"}`;
      await env.BUCKET.put(next, intro.stream(), { httpMetadata: { contentType: intro.type } });
      if (introKey) await env.BUCKET.delete(introKey);
      introKey = next;
    }
    if ((!logo || !(logo instanceof File) || !logo.size) && (!intro || !(intro instanceof File) || !intro.size)) return responseJson({ error: "Scegli almeno un file." }, 400);
    await env.DB.prepare("UPDATE site_settings SET logo_url=?,intro_photo_key=?,updated_at=CURRENT_TIMESTAMP WHERE id='default'")
      .bind(logoKey, introKey).run();
    return responseJson({ ok: true, logo_url: logoKey, intro_photo_key: introKey });
  }

  return responseJson({ error: "Endpoint non trovato" }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    try {
      if (path.startsWith("/api/admin/")) return await handleAdminApi(request, env, path);
      if (path === "/admin") {
        const user = currentUser(request);
        let page = adminLoginPage();
        if (user.id) {
          const admin = await env.DB.prepare("SELECT email FROM site_admins WHERE email = ? COLLATE NOCASE").bind(user.email).first();
          page = admin ? adminPageV3(user) : adminDeniedPage(user);
        }
        return new Response(page, {
          headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
        });
      }
      if (path === "/") return Response.redirect(new URL("/g/serata-villa/view-night", request.url), 302);

      const adminMediaMatch = path.match(/^\/admin-media\/(.+)$/);
      if (adminMediaMatch) {
        await requireAdmin(request, env);
        const key = decodeURIComponent(adminMediaMatch[1]);
        if (!key.startsWith("galleries/")) return new Response("Not found", { status: 404 });
        const object = await env.BUCKET.get(key);
        if (!object) return new Response("Not found", { status: 404 });
        return new Response(object.body, { headers: { "content-type": object.httpMetadata?.contentType || "application/octet-stream", "cache-control": "private, max-age=300" } });
      }

      const brandingMatch = path.match(/^\/branding\/(.+)$/);
      if (brandingMatch) {
        const key = decodeURIComponent(brandingMatch[1]);
        if (!key.startsWith("branding/")) return new Response("Not found", { status: 404 });
        const object = await env.BUCKET.get(key);
        if (!object) return new Response("Not found", { status: 404 });
        return new Response(object.body, { headers: { "content-type": object.httpMetadata?.contentType || "application/octet-stream", "cache-control": "public, max-age=3600" } });
      }

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

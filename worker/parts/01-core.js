const CONTACT_SHEET = "";

const responseJson = (value, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { "content-type": "application/json; charset=utf-8" },
});

const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character]);

const currentUser = (request) => ({
  id: request.headers.get("oai-authenticated-user-id") || "",
  email: request.headers.get("oai-authenticated-user-email") || "",
});

function requireUser(request) {
  const user = currentUser(request);
  if (!user.id) throw new Response("Autenticazione richiesta", { status: 401 });
  return user;
}

const makeSlug = (value) => String(value).normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "").slice(0, 64);

async function digest(value) {
  const result = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(result)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

const demoGallery = {
  id: "demo",
  slug: "serata-villa",
  title: "Serata in Villa",
  description: "Una storia di luce, dettagli e attese.",
  event_date: "20 · 09 · 2026",
  published: 1,
  download_enabled: 0,
  password_hash: null,
  photos: Array.from({ length: 36 }, (_, index) => ({ id: `demo-${index + 1}`, sort_order: index })),
};

async function readGallery(env, slug, includeHidden = false) {
  const item = await env.DB.prepare("SELECT * FROM galleries WHERE slug = ?").bind(slug).first();
  if (!item || (!includeHidden && !item.published)) return null;
  const photos = await env.DB.prepare("SELECT * FROM photos WHERE gallery_id = ? ORDER BY sort_order, created_at")
    .bind(item.id).all();
  return { ...item, photos: photos.results || [] };
}

function globalStyles() {
  return `<style>
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;1,300&family=Josefin+Sans:wght@200;300;400&display=swap');
:root{--ink:#0a0805;--paper:#f5f0e8;--gold:#c9a96e;--line:#4c443b;color-scheme:dark}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--ink);color:var(--paper);font:300 16px/1.5 'Josefin Sans',sans-serif;overflow-x:hidden}button,input,textarea,select{font:inherit}button{cursor:pointer}.shell{max-width:1420px;margin:auto;padding:14px 20px 90px}.mast{display:flex;justify-content:center;gap:12px;position:relative;z-index:3}.outline,.gold{border:1px solid #5b5147;background:transparent;color:var(--paper);padding:11px 23px;letter-spacing:.27em;font-size:9px;text-transform:uppercase}.gold{background:var(--gold);border-color:var(--gold);color:var(--ink)}.logo{padding:9px 14px;border:1px solid #5b5147;letter-spacing:.2em;font-size:9px}.print{text-align:center;margin:21px auto 7px;display:block;background:none;border:0;color:var(--paper);letter-spacing:.23em;font-size:9px}.print b{display:block;color:var(--gold);border-bottom:1px solid var(--gold);font-weight:300}.timeline{height:34px;display:flex;align-items:end;gap:4px;border-bottom:1px solid #3d362f}.timeline i{flex:1;height:3px;background:#655d55}.timeline i:nth-child(4n){height:18px}.timeline i:nth-child(7n){height:28px;background:var(--gold)}.chapters{display:flex;gap:7px;overflow:auto;padding:7px 0 28px;scrollbar-width:none}.chapters button{white-space:nowrap;border:1px solid #62594f;border-radius:99px;background:#0d0a08;color:#bbb1a8;padding:6px 13px;font-size:10px}.chapter{font:italic 300 clamp(38px,7vw,90px)/1 'Cormorant Garamond',serif;text-align:center;margin:55px 0 28px}.grid{display:grid;grid-template-columns:repeat(12,1fr);gap:18px 14px;align-items:start}.card{--rotation:0deg;grid-column:span 4;position:relative;border:0;background:#eee9df;padding:8px 8px 27px;transform:rotate(var(--rotation));box-shadow:0 12px 26px #0008;color:#18130f;transition:transform .25s,box-shadow .25s}.card:nth-child(5n+1){--rotation:-.7deg}.card:nth-child(7n){--rotation:.9deg}.card:hover{transform:translateY(-5px);box-shadow:0 18px 34px #000c}.card.wide{grid-column:span 6}.card.tall .picture{aspect-ratio:3/4}.picture{display:block;aspect-ratio:4/3;background:url('${CONTACT_SHEET}');background-size:400% 300%;background-position:var(--x) var(--y)}.number{position:absolute;bottom:7px;left:10px;font-size:8px;letter-spacing:.17em}.selected{outline:3px solid var(--gold)}.selected:after{content:'✓';position:absolute;right:12px;top:12px;background:var(--gold);color:#111;width:28px;height:28px;display:grid;place-items:center;border-radius:50%}.closing{text-align:center;padding:110px 15px 30px}.closing h2{font:italic 300 clamp(75px,13vw,170px)/.8 'Cormorant Garamond',serif;margin:0}.closing p{font-size:9px;letter-spacing:.2em}.intro{position:fixed;inset:0;z-index:30;display:grid;place-items:center;background:#080705;transition:opacity 1s;overflow:hidden}.intro.hide{opacity:0;pointer-events:none}.intro-bg{position:absolute;inset:0;background:linear-gradient(#0006,#0009),url('${CONTACT_SHEET}');background-size:400% 300%;animation:frames 14s steps(1) infinite,ken 6s ease-in-out infinite alternate}.intro-copy{z-index:1;text-align:center}.intro-copy small{letter-spacing:.5em;font-size:9px}.intro h1{font:300 clamp(58px,11vw,150px)/.78 'Cormorant Garamond',serif;margin:22px 0 42px}.skip{position:absolute;z-index:2;right:22px;bottom:22px}.enter{border:1px solid #887b70;background:#1115;color:#fff;padding:14px 36px;letter-spacing:.4em;font-size:9px}@keyframes frames{0%{background-position:0 0}25%{background-position:66% 0}50%{background-position:0 50%}75%{background-position:100% 100%}}@keyframes ken{to{transform:scale(1.05)}}
.lightbox{position:fixed;inset:0;z-index:40;background:#050403;display:none}.lightbox.open{display:grid;grid-template-columns:1fr minmax(280px,720px) 1fr}.lightbox-picture{background:url('${CONTACT_SHEET}');background-size:400% 300%;background-position:var(--x) var(--y)}.lightbox-close,.lightbox-next,.lightbox-prev,.lightbox-download{position:absolute;z-index:2;color:#fff;background:#1118;border:1px solid #ffffff35;border-radius:99px}.lightbox-close{top:18px;left:20px;border:0;background:none;font-size:26px}.lightbox-next,.lightbox-prev{top:48%;width:46px;height:46px}.lightbox-next{right:18px}.lightbox-prev{left:18px}.lightbox-download{bottom:20px;left:50%;transform:translateX(-50%);padding:11px 22px}.lightbox-count{position:absolute;top:22px;left:50%;transform:translateX(-50%);font-size:9px;letter-spacing:.2em}.selection-done{position:fixed;bottom:15px;left:50%;transform:translateX(-50%);z-index:10;display:none}.selecting .selection-done{display:block}
.admin{max-width:1180px;margin:auto;padding:32px 20px 80px}.admin-head{display:flex;justify-content:space-between;align-items:end;border-bottom:1px solid #3d362f;padding-bottom:22px}.admin h1{font:300 58px 'Cormorant Garamond';margin:0}.admin-grid{display:grid;grid-template-columns:360px 1fr;gap:28px;margin-top:28px}.panel{border:1px solid #3d362f;padding:20px;background:#0f0c09}.panel h2{font:300 30px 'Cormorant Garamond';margin-top:0}.field{display:grid;gap:6px;margin:12px 0}.field label,.status{font-size:9px;letter-spacing:.16em;color:#c9a96e}.field input,.field textarea,.field select{width:100%;background:#15110e;border:1px solid #51483f;color:#fff;padding:10px}.checks{display:flex;gap:18px;font-size:11px;margin:15px 0}.gallery-row{display:grid;grid-template-columns:1fr auto;gap:10px;border-bottom:1px solid #332d28;padding:14px 0}.gallery-row strong{font:300 24px 'Cormorant Garamond'}.upload-drop{display:block;border:1px dashed #665e55;padding:25px;text-align:center}.progress{height:4px;background:#28221d;margin:10px 0}.progress i{display:block;height:100%;width:0;background:var(--gold)}.danger{color:#e19983}.photo-list{display:grid;gap:7px;margin-top:15px}.photo-item{display:flex;justify-content:space-between;gap:8px;border:1px solid #3a332d;padding:8px;font-size:10px}
@media(max-width:900px){.card{grid-column:span 6}.card.wide{grid-column:span 12}.admin-grid{grid-template-columns:1fr}.lightbox.open{grid-template-columns:0 1fr 0}.mast{flex-wrap:wrap}}
@media(max-width:520px){.shell{padding:10px 8px 60px}.grid{gap:11px 7px}.card{padding:6px 6px 23px}.outline,.gold{padding:10px 13px;font-size:8px}.intro h1{font-size:64px}.admin h1{font-size:44px}.admin-head{align-items:start;gap:15px}}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
.picture{background-image:var(--photo,linear-gradient(145deg,#d9d1c7,#8d8276 52%,#28231f));background-size:var(--photo-size,cover)}
.card:nth-child(3n+2) .picture{background-image:var(--photo,linear-gradient(35deg,#171410,#9b8b78 55%,#e8e0d7))}.card:nth-child(3n) .picture{background-image:var(--photo,radial-gradient(circle at 65% 35%,#d1b47b,#51463b 30%,#111 70%))}.intro-bg{background-image:radial-gradient(circle at 65% 30%,#7f6c53,#221b15 36%,#070605 75%)}.lightbox-picture{background-image:linear-gradient(145deg,#d9d1c7,#8d8276 52%,#28231f)}
</style>`;
}

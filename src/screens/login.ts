// "Who is playing?": the child taps their own avatar. Parents add, edit and delete children here.

import { getApp } from "../app";
import { addKid, countKids, deleteKid, getKid, KID_COLORS, listKids, updateKid, type Kid } from "../data/kids";
import { starTotal } from "../data/stars";
import { avatar } from "../ui/avatar";
import { byId, h, icon, twoTapDelete } from "../ui/dom";
import { canvasToJpeg, loadImageFile, onFilePicked, squareCrop } from "../ui/images";
import { go, onEnter } from "../ui/nav";

let editing = false;

interface FormState {
  id: number | null;
  color: number;
  /** undefined = keep the current photo */
  photo?: ArrayBuffer;
  previewUrl: string | null;
}
let form: FormState = { id: null, color: 0, previewUrl: null };

export function setupLogin(onPicked: (kid: Kid) => void): void {
  onEnter("login", () => {
    editing = false;
    render();
  });

  byId("kidEdit").addEventListener("click", () => {
    editing = !editing;
    render();
  });

  function render() {
    const { db } = getApp();
    const kids = listKids(db);
    if (!kids.length) editing = false;
    byId("loginHint").hidden = kids.length > 0;
    const edit = byId("kidEdit");
    edit.hidden = !kids.length;
    edit.textContent = editing ? "Done" : "Edit";

    const list = byId("kidList");
    list.replaceChildren();
    for (const k of kids) {
      const card = h("div", { class: "kid-slot" });
      const b = h(
        "button",
        { type: "button", class: "kid-card", "aria-label": k.name },
        avatar(k),
        k.name,
        h("span", { class: "kid-stars" }, icon("star"), String(starTotal(db, k.id)))
      );
      b.addEventListener("click", () => (editing ? openForm(k) : onPicked(k)));
      card.append(b);
      if (editing) {
        const ed = h("button", { type: "button", class: "edit-badge", "aria-label": `Edit ${k.name}` }, icon("edit"));
        ed.addEventListener("click", () => openForm(k));
        const del = twoTapDelete({
          className: "del-badge",
          label: `Delete ${k.name}`,
          armedLabel: "Delete all?",
          onConfirm: () => {
            const a = getApp();
            deleteKid(a.db, k.id);
            if (a.kid?.id === k.id) a.kid = null;
            render();
          }
        });
        card.append(h("div", { class: "kid-tools" }, ed, del));
      }
      list.append(card);
    }
    const add = h(
      "button",
      { type: "button", class: "kid-card add-kid" },
      h("span", { class: "avatar add" }, icon("plus")),
      "Add child"
    );
    add.addEventListener("click", () => openForm(null));
    list.append(add);
  }

  // ----- Add / edit form -----
  const wrap = byId("kidFormWrap");
  const nameInput = byId<HTMLInputElement>("kidName");

  function drawForm() {
    const k = form.id ? getKid(getApp().db, form.id) : null;
    const preview = { name: nameInput.value || "?", color: form.color, photo_key: form.photo === undefined ? (k?.photo_key ?? null) : null };
    const a = avatar(preview, form.previewUrl);
    a.id = "kidFormAvatar";
    byId("kidFormAvatar").replaceWith(a);
    const sw = byId("kidSwatches");
    sw.replaceChildren(
      ...KID_COLORS.map(([bg], i) => {
        const b = h("button", {
          type: "button",
          class: `swatch${i === form.color ? " on" : ""}`,
          style: `background: ${bg}`,
          role: "radio",
          "aria-checked": i === form.color ? "true" : "false",
          "aria-label": `Color ${i + 1}`
        });
        b.addEventListener("click", () => {
          form.color = i;
          drawForm();
        });
        return b;
      })
    );
  }

  function openForm(k: Kid | null) {
    if (form.previewUrl) URL.revokeObjectURL(form.previewUrl);
    form = { id: k?.id ?? null, color: k ? k.color : countKids(getApp().db) % KID_COLORS.length, previewUrl: null };
    byId("kidFormTitle").textContent = k ? "Edit child" : "Add child";
    nameInput.value = k?.name ?? "";
    drawForm();
    wrap.hidden = false;
    nameInput.focus();
  }

  function closeForm() {
    wrap.hidden = true;
    if (form.previewUrl) URL.revokeObjectURL(form.previewUrl);
    form.previewUrl = null;
  }

  nameInput.addEventListener("input", drawForm);
  byId("kidCancel").addEventListener("click", closeForm);
  onFilePicked(byId<HTMLInputElement>("kidImg"), async (file) => {
    try {
      const c = squareCrop(await loadImageFile(file), 300);
      form.photo = await canvasToJpeg(c, 0.82);
      if (form.previewUrl) URL.revokeObjectURL(form.previewUrl);
      form.previewUrl = URL.createObjectURL(new Blob([form.photo], { type: "image/jpeg" }));
      drawForm();
    } catch (e) {
      console.error(e);
    }
  });

  byId<HTMLFormElement>("kidForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = nameInput.value.trim();
    if (!name) return;
    const a = getApp();
    const photoKey = form.photo ? await a.files.put(form.photo) : undefined;
    if (form.id) {
      updateKid(a.db, form.id, name, form.color, photoKey);
      if (a.kid?.id === form.id) a.kid = getKid(a.db, form.id);
    } else {
      addKid(a.db, name, form.color, photoKey ?? null);
    }
    closeForm();
    render();
  });
}

/** Sends the child to the picker whenever nobody is signed in. */
export function requireKid(name: Parameters<typeof go>[0]): Parameters<typeof go>[0] {
  return getApp().kid || name === "login" ? name : "login";
}

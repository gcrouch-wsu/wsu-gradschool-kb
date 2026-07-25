import { createPage } from "@/lib/kb-store";

/** Seed a small starter outline when creating a KB from the admin template option. */
export async function seedKbStarterTemplate(kbId: string, authorEmail: string): Promise<void> {
  await createPage({
    kbId,
    title: "Getting started",
    slug: "getting-started",
    summary: "Introduce this knowledge base and how readers should use it.",
    status: "draft",
    authorEmail,
    blocks: [
      {
        blockId: `block-${crypto.randomUUID()}`,
        type: "paragraph",
        text: "Replace this page with an overview of your knowledge base: who it is for, what it covers, and where to start.",
      },
      {
        blockId: `block-${crypto.randomUUID()}`,
        type: "heading",
        level: 2,
        text: "What is in this knowledge base",
      },
      {
        blockId: `block-${crypto.randomUUID()}`,
        type: "list",
        items: ["Key policies and procedures", "How-to guides", "Contacts and escalation paths"],
      },
    ],
  });

  await createPage({
    kbId,
    title: "Contacts",
    slug: "contacts",
    summary: "Who to contact for questions about this knowledge base.",
    status: "draft",
    authorEmail,
    blocks: [
      {
        blockId: `block-${crypto.randomUUID()}`,
        type: "paragraph",
        text: "List the primary contact for content questions and the owner for governance changes.",
      },
    ],
  });
}

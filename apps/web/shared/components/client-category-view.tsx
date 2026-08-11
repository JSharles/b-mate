import type { PublicClientCategory } from "schemas";
export function ClientCategoryView({ category }: { category: PublicClientCategory }) {
  return <div className="space-y-3">{category.blocks.map((block, index) => block.type === "bullet" ? <div key={index} className="flex gap-2"><span aria-hidden="true">•</span><p>{block.text}</p></div> : <p key={index} className={block.type === "open_point" ? "rounded-lg border border-border bg-muted p-3" : "leading-7"}>{block.text}</p>)}</div>;
}

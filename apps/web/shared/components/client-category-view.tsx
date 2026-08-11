import type { PublicClientCategory } from "schemas";
export function ClientCategoryView({ category }: { category: PublicClientCategory }) {
  return <div className="space-y-3">{category.blocks.map((block, index) => block.type === "bullet" ? <div key={index} className="flex gap-2"><span aria-hidden="true">•</span><p>{block.text}</p></div> : <p key={index} className={block.type === "open_point" ? "rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-amber-100" : "leading-7"}>{block.text}</p>)}</div>;
}

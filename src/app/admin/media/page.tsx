import { AltTextEditor, MediaUpload } from "@/components/admin/media-upload";
import { Card, EmptyState, PageHeader, Pager, Table } from "@/components/ui";
import { env } from "@/server/env";
import { listMedia } from "@/server/media/media";

export default async function MediaPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const page = Math.max(1, Number((await searchParams).page) || 1);
  const r = await listMedia(undefined, page, 30);
  const pages = Math.max(1, Math.ceil(r.total / 30));
  return (
    <>
      <PageHeader title="Media" subtitle="Copy a media ID into the CSV image columns or the question editor. External image URLs are not accepted." />
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <section>
          {r.items.length === 0 ? (
            <EmptyState>No images uploaded yet.</EmptyState>
          ) : (
            <Table caption="Media">
              <thead>
                <tr>
                  <th>Image</th>
                  <th>Media ID</th>
                  <th>Type</th>
                  <th>Alt text</th>
                </tr>
              </thead>
              <tbody>
                {r.items.map((m) => (
                  <tr key={m.id}>
                    <td>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/api/v1/media/${m.id}`} alt={m.altText ?? ""} className="h-14 w-20 rounded border border-border bg-white object-contain" />
                    </td>
                    <td className="font-mono text-xs select-all">{m.id}</td>
                    <td className="text-xs">
                      {m.kind}
                      <br />
                      {m.width}×{m.height}
                    </td>
                    <td>
                      <AltTextEditor id={m.id} initial={m.altText ?? ""} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          <Pager page={page} pages={pages} hrefFor={(p) => `/admin/media?page=${p}`} label={`Page ${page} of ${pages}`} />
        </section>
        <Card>
          <h2 className="mb-3 font-bold">Upload image</h2>
          <MediaUpload maxKb={Math.round(env().MEDIA_MAX_BYTES / 1024)} />
        </Card>
      </div>
    </>
  );
}

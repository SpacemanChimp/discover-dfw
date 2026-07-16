/* Shared placement wrapper — keeps every conversion panel visually
   SECONDARY to the page's editorial content: constrained width, quiet
   spacing, never a band that spans the viewport. One slot per region. */
export default function ConvertSlot({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <div id={id} style={{ maxWidth: 780, margin: "0 auto", padding: "30px 4vw 10px" }}>
      {children}
    </div>
  );
}

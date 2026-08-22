/**
 * Kategorija pitanja u KvizAtar-u — ime paka iz kog je pitanje došlo.
 *
 * Isto što Kviz ispisuje na traci iznad pitanja (`packName`): metapodatak sa
 * strane pitanja, bez ijednog dela odgovora. Stoji samo na telefonu — TV već
 * nosi mapu, cilj napada i poene, pa bi mu još jedan red teksta uz pitanje
 * oduzeo prostor bez potrebe.
 *
 * Bez poznatog paka (ugrađena banka, broj-pitanja) elementa nema — nikad ne
 * ostavlja praznu traku iza sebe.
 */
export function BitkaPackChip({
  name,
  align = 'center',
  size = '0.7rem',
}: {
  name?: string;
  align?: 'center' | 'left';
  size?: string;
}) {
  if (!name) return null;
  return (
    <div
      style={{
        fontSize: size,
        fontWeight: 800,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color: 'var(--accent)',
        textAlign: align,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        flexShrink: 0,
      }}
    >
      {name}
    </div>
  );
}

// Letterboxed photo that fills its parent. Used in hostless rooms where
// the phone is the only screen showing the round photo (Foto kviz,
// Pogodi gde je).
export function PhotoFrame({ imageUrl }: { imageUrl: string }) {
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#000',
        borderRadius: '0.6rem',
        overflow: 'hidden',
        height: '100%',
      }}
    >
      <img
        src={imageUrl}
        alt=""
        style={{
          maxWidth: '100%',
          maxHeight: '100%',
          objectFit: 'contain',
          display: 'block',
        }}
      />
    </div>
  );
}

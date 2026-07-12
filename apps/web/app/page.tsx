import { Console } from "./console";

export default function Home() {
  return (
    <main className="wrap stage" tabIndex={-1}>
      <Console />
      <p className="footstrip">gipc.dev · arcane palette · IBM Plex Mono · hex-sigil mark</p>
    </main>
  );
}

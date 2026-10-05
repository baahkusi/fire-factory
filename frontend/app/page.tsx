import {Fire} from "./fire";

export default function HomePage() {
  return (
    <div className="landing">
      <div className="fire-stage">
        <Fire />
      </div>
      <div className="landing-foot">
        <h1 className="landing-title">A Firebase base, kept ready.</h1>
        <a href="https://github.com/baahkusi/fire-factory">GitHub</a>
      </div>
    </div>
  );
}

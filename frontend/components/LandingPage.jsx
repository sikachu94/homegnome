import gnomeLogo from "../assets/gnome_only.jpg";
import "./LandingPage.css";

/**
 * First screen a visitor sees, before they're signed in. Deliberately
 * minimal: the gnome, one line, one button. `onGetStarted` should route
 * into whatever sign up / log in flow the app ends up using.
 */
export function LandingPage({ onGetStarted }) {
  return (
    <div className="lp-root">
      <img src={gnomeLogo} alt="myGnomie" className="lp-gnome" />
      <h1 className="lp-title">Let's get planting, myGnomie</h1>
      <button className="lp-cta" onClick={onGetStarted}>
        Sign up / Log in
      </button>
    </div>
  );
}

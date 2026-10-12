import React from "react";

// Empêche qu'un crash dans une page ne fasse planter toute l'application :
// affiche un écran de récupération avec un bouton « Recharger ».
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error("ErrorBoundary caught:", error, info);
  }

  handleReload = () => {
    this.setState({ hasError: false });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen grid place-items-center bg-background p-6 text-center">
          <div className="max-w-sm">
            <h1 className="font-display text-xl font-bold text-foreground">
              Une erreur est survenue
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Veuillez recharger la page pour continuer.
            </p>
            <button
              onClick={this.handleReload}
              className="mt-5 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground"
            >
              Recharger
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
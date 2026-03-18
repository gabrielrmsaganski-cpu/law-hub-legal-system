import "./globals.css";

export const metadata = {
  title: "LAW Plataforma Juridica",
  description: "Monitoramento juridico corporativo para prevencao de perdas."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}

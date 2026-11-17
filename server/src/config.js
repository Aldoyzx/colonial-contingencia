const port = Number.parseInt(process.env.PORT ?? '4000', 10);
if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  throw new Error(`PORT inválido: ${process.env.PORT}`);
}

const databaseUrl = process.env.DATABASE_URL ?? 'postgres://contingencia:contingencia@localhost:5432/contingencia';
if (!/^postgres(ql)?:\/\//.test(databaseUrl)) {
  throw new Error('DATABASE_URL debe tener el formato postgres://usuario:clave@host:puerto/base');
}

export const config = Object.freeze({ port, databaseUrl });

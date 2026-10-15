export class Server {
  async ping(): Promise<string> {
    return 'pong';
  }
}

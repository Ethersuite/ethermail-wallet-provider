import { iframeCommunicator } from './iframe-communicator';
import { SocketCommunicator } from './socket-communicator';

export class CommunicatorFactory {
  static create(options: any) {
    if (window?.parent !== window) {
      return new iframeCommunicator(options);
    } else {
      return new SocketCommunicator(options);
    }
  }
}
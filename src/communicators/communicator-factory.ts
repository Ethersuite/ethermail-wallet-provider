import { iframeCommunicator } from './iframe-communicator';
import { SocketCommunicator } from './socket-communicator';

export class CommunicatorFactory {
  static create(options: any) {
    // @ts-ignore
    if (window?.ethereum?.isEtherMail || window?.parent !== window) {
      return new iframeCommunicator(options);
    } else {
      return new SocketCommunicator(options);
    }
  }
}
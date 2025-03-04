interface Window {
  _reportPath?: string;
  _reportFileHandle?: FileSystemFileHandle;
  audioRecorder?: {
    stop: () => void;
  };
}

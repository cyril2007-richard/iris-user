import { create } from 'zustand';

interface DeviceState {
  deviceId: string | null;
  piReachable: boolean;
  piIp: string | null;
  status: 'online' | 'offline';
  setDeviceId: (id: string | null) => void;
  setPiReachable: (reachable: boolean) => void;
  setPiIp: (ip: string | null) => void;
  setStatus: (status: 'online' | 'offline') => void;
}

export const useDeviceStore = create<DeviceState>((set) => ({
  deviceId: null,
  piReachable: false,
  piIp: null,
  status: 'offline',
  setDeviceId: (id) => set({ deviceId: id }),
  setPiReachable: (reachable) => set({ piReachable: reachable }),
  setPiIp: (ip) => set({ piIp: ip }),
  setStatus: (status) => set({ status }),
}));

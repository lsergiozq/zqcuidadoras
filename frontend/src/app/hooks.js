import { useCallback, useEffect, useState } from "react";
import { api } from "./api";

export function useData(enabled) {
  const [caregivers, setCaregivers] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [extras, setExtras] = useState([]);
  const [elders, setElders] = useState([]);
  const [serviceTypes, setServiceTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadAll = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      setError("");
      return;
    }
    try {
      setError("");
      const [caregiverList, shiftList, extraList, elderList, serviceTypeList] = await Promise.all([
        api.get("/caregivers"),
        api.get("/shifts"),
        api.get("/extra-charges"),
        api.get("/elders"),
        api.get("/service-types"),
      ]);
      setCaregivers(caregiverList);
      setShifts(shiftList);
      setExtras(extraList);
      setElders(elderList);
      setServiceTypes(serviceTypeList);
    } catch (error) {
      setError(error?.message || "Não foi possível conectar ao servidor.");
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      setError("");
      return;
    }
    setLoading(true);
    loadAll();
  }, [enabled, loadAll]);

  return { caregivers, setCaregivers, shifts, setShifts, extras, setExtras, elders, setElders, serviceTypes, setServiceTypes, loading, error };
}

export function useCaregiverData(enabled) {
  const [dashboard, setDashboard] = useState(null);
  const [elders, setElders] = useState([]);
  const [serviceTypes, setServiceTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      setError("");
      setDashboard(null);
      setElders([]);
      setServiceTypes([]);
      return;
    }
    setLoading(true);
    try {
      setError("");
      const [dashboardData, elderList, serviceTypeList] = await Promise.all([
        api.get("/caregiver/dashboard"),
        api.get("/elders?active_only=true"),
        api.get("/service-types?active_only=true"),
      ]);
      setDashboard(dashboardData);
      setElders(elderList);
      setServiceTypes(serviceTypeList);
    } catch (error) {
      setError(error.message || "Não foi possível carregar o portal da cuidadora.");
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { dashboard, elders, serviceTypes, loading, error, reload, setDashboard };
}

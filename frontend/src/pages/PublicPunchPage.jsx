import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api";
import { BRAND } from "../brand";
import { onlyDigits, statusClass } from "../utils";

const captureFrame = (video) => {
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.9);
};

const PublicPunchPage = () => {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const previewTimeoutRef = useRef(null);
  const [cpf, setCpf] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageStatus, setMessageStatus] = useState("");
  const [previewImage, setPreviewImage] = useState("");
  const [cameraReady, setCameraReady] = useState(false);

  const attachStreamToVideo = async (stream) => {
    if (!videoRef.current) return;
    if (videoRef.current.srcObject !== stream) {
      videoRef.current.srcObject = stream;
    }
    await videoRef.current.play().catch(() => null);
  };

  const startCamera = async ({ showError = true } = {}) => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        if (showError) {
          setMessage("Seu navegador nao suporta acesso a camera.");
          setMessageStatus("NEGADO");
        }
        return false;
      }

      if (streamRef.current) {
        await attachStreamToVideo(streamRef.current);
        setCameraReady(true);
        return true;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false
      });
      streamRef.current = stream;
      await attachStreamToVideo(stream);
      setCameraReady(true);
      return true;
    } catch (_error) {
      setCameraReady(false);
      if (showError) {
        setMessage("Permita o uso da camera no navegador e recarregue a pagina.");
        setMessageStatus("NEGADO");
      }
      return false;
    }
  };

  const stopCamera = () => {
    if (!streamRef.current) return;
    streamRef.current.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraReady(false);
  };

  const refreshCamera = async () => {
    stopCamera();
    await startCamera({ showError: false });
  };

  useEffect(() => {
    startCamera({ showError: true });

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        startCamera({ showError: false });
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      if (previewTimeoutRef.current) clearTimeout(previewTimeoutRef.current);
      stopCamera();
    };
  }, []);

  const resetPreview = () => {
    if (previewTimeoutRef.current) clearTimeout(previewTimeoutRef.current);
    previewTimeoutRef.current = setTimeout(async () => {
      setPreviewImage("");
      // Refresh completo para evitar tela preta apos preview.
      await refreshCamera();
    }, 1500);
  };

  const submitPunch = async (event) => {
    event.preventDefault();
    setMessage("");
    setMessageStatus("");
    const cleanCpf = onlyDigits(cpf);
    if (!cleanCpf) {
      setMessage("Informe o CPF.");
      setMessageStatus("NEGADO");
      return;
    }
    if (!videoRef.current || !streamRef.current) {
      const ok = await startCamera({ showError: true });
      if (!ok || !videoRef.current || !streamRef.current) return;
    }

    try {
      setLoading(true);
      const imageBase64 = captureFrame(videoRef.current);
      const { data } = await api.post("/public/punch", { cpf: cleanCpf, imageBase64 });
      setPreviewImage(imageBase64);
      setMessage(data.message);
      setMessageStatus(data.record?.status || "CONFIRMADO");
      setCpf("");
      resetPreview();
    } catch (error) {
      setMessage(error.response?.data?.error || "Falha ao registrar ponto.");
      setMessageStatus("NEGADO");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="public-page">
      <div className="panel hero-panel">
        <p className="eyebrow">{BRAND.appName}</p>
        <h1>Registro de ponto - Omega Distribuidora</h1>
        <form onSubmit={submitPunch} className="row-form">
          <input
            type="text"
            inputMode="numeric"
            placeholder="Digite o CPF"
            value={cpf}
            onChange={(e) => setCpf(onlyDigits(e.target.value))}
            autoFocus
          />
          <button type="submit" disabled={loading || !cameraReady}>
            {loading ? "Registrando..." : "Registrar ponto"}
          </button>
        </form>
        <p className="muted small">Digite o CPF e pressione Enter.</p>
        <p className="muted small">{cameraReady ? "Camera ativa." : "Aguardando permissao da camera..."}</p>
        {message ? <p className={`feedback ${statusClass(messageStatus)}`}>{message}</p> : null}
        <div className="nav-links">
          <Link to="/login">Entrar no sistema</Link>
        </div>
      </div>

      <div className="panel camera-panel">
        {previewImage ? (
          <img src={previewImage} alt="Foto registrada" className="camera-preview" />
        ) : (
          <video ref={videoRef} autoPlay playsInline muted className="camera-preview" />
        )}
      </div>
    </div>
  );
};

export default PublicPunchPage;

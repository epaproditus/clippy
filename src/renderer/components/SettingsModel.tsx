import { Column, TableView } from "./TableView";
import { Progress } from "./Progress";
import React, { useEffect, useRef, useState } from "react";
import { useSharedState } from "../contexts/SharedStateContext";
import { clippyApi } from "../clippyApi";
import { prettyDownloadSpeed } from "../helpers/convert-download-speed";
import { ManagedModel } from "../../models";
import { isModelDownloading } from "../../helpers/model-helpers";
import {
  isRemoteModelConfigured,
  isRemoteProvider,
  ModelProvider,
} from "../../sharedState";

export const SettingsModel: React.FC = () => {
  const { models, settings } = useSharedState();
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const useRemoteModel = isRemoteProvider(settings);
  const [tempRemoteEndpoint, setTempRemoteEndpoint] = useState(
    settings.remoteEndpoint || "",
  );
  const [tempRemoteModel, setTempRemoteModel] = useState(
    settings.remoteModel || "",
  );
  const [tempRemoteApiKey, setTempRemoteApiKey] = useState(
    settings.remoteApiKey || "",
  );
  const hasRemoteEditsRef = useRef(false);
  const latestSettingsRef = useRef(settings);
  const latestRemoteEndpointRef = useRef(tempRemoteEndpoint);
  const latestRemoteModelRef = useRef(tempRemoteModel);
  const latestRemoteApiKeyRef = useRef(tempRemoteApiKey);

  const columns: Array<Column> = [
    { key: "default", header: "Loaded", width: 50 },
    { key: "name", header: "Name" },
    {
      key: "size",
      header: "Size",
      render: (row) => `${row.size.toLocaleString()} MB`,
    },
    { key: "company", header: "Company" },
    { key: "downloaded", header: "Downloaded" },
  ];

  const modelKeys = Object.keys(models || {});
  const data = modelKeys.map((modelKey) => {
    const model = models?.[modelKey as keyof typeof models];

    return {
      default: model?.name === settings.selectedModel ? "ｘ" : "",
      name: model?.name,
      company: model?.company,
      size: model?.size,
      downloaded: model.downloaded ? "Yes" : "No",
    };
  });

  // Variables
  const selectedModel =
    models?.[modelKeys[selectedIndex] as keyof typeof models] || null;
  const isDownloading = isModelDownloading(selectedModel);
  const isDefaultModel = selectedModel?.name === settings.selectedModel;

  // Handlers
  // ---------------------------------------------------------------------------
  const handleRowSelect = (index: number) => {
    if (useRemoteModel) {
      return;
    }

    setSelectedIndex(index);
  };

  const handleDownload = async () => {
    if (selectedModel) {
      await clippyApi.downloadModelByName(data[selectedIndex].name);
    }
  };

  const handleDeleteOrRemove = async () => {
    if (selectedModel?.imported) {
      await clippyApi.removeModelByName(selectedModel.name);
    } else if (selectedModel) {
      await clippyApi.deleteModelByName(selectedModel.name);
    }
  };

  const handleMakeDefault = async () => {
    if (selectedModel) {
      clippyApi.setState("settings.selectedModel", selectedModel.name);
    }
  };

  const handleProviderChange = (provider: ModelProvider) => {
    clippyApi.setState("settings.modelProvider", provider);
  };

  const saveRemoteSettings = () => {
    if (!hasRemoteEditsRef.current) {
      return;
    }

    hasRemoteEditsRef.current = false;
    clippyApi.setState("settings", {
      ...settings,
      remoteEndpoint: tempRemoteEndpoint,
      remoteModel: tempRemoteModel,
      remoteApiKey: tempRemoteApiKey,
    });
  };

  useEffect(() => {
    latestSettingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    latestRemoteEndpointRef.current = tempRemoteEndpoint;
  }, [tempRemoteEndpoint]);

  useEffect(() => {
    latestRemoteModelRef.current = tempRemoteModel;
  }, [tempRemoteModel]);

  useEffect(() => {
    latestRemoteApiKeyRef.current = tempRemoteApiKey;
  }, [tempRemoteApiKey]);

  // Keep local drafts in sync if settings are changed externally.
  useEffect(() => {
    if (hasRemoteEditsRef.current) {
      return;
    }

    setTempRemoteEndpoint(settings.remoteEndpoint || "");
    setTempRemoteModel(settings.remoteModel || "");
    setTempRemoteApiKey(settings.remoteApiKey || "");
  }, [settings.remoteEndpoint, settings.remoteModel, settings.remoteApiKey]);

  // Persist pending edits when leaving this view.
  useEffect(() => {
    return () => {
      if (!hasRemoteEditsRef.current) {
        return;
      }

      hasRemoteEditsRef.current = false;
      clippyApi.setState("settings", {
        ...latestSettingsRef.current,
        remoteEndpoint: latestRemoteEndpointRef.current,
        remoteModel: latestRemoteModelRef.current,
        remoteApiKey: latestRemoteApiKeyRef.current,
      });
    };
  }, []);

  return (
    <div>
      <fieldset>
        <legend>Provider</legend>
        <div className="field-row">
          <input
            id="modelProviderLocal"
            type="radio"
            name="modelProvider"
            checked={!useRemoteModel}
            onChange={() => handleProviderChange("local")}
          />
          <label htmlFor="modelProviderLocal">Local GGUF (llama.cpp)</label>
        </div>
        <div className="field-row">
          <input
            id="modelProviderRemote"
            type="radio"
            name="modelProvider"
            checked={useRemoteModel}
            onChange={() => handleProviderChange("remote")}
          />
          <label htmlFor="modelProviderRemote">
            Remote API (OpenAI-compatible)
          </label>
        </div>
      </fieldset>

      {useRemoteModel && (
        <fieldset style={{ marginTop: 20 }}>
          <legend>Remote Settings</legend>
          <p>
            Use any endpoint that supports OpenAI-style chat completion
            requests.
          </p>
          <div className="field-row-stacked">
            <label htmlFor="remoteEndpoint">Endpoint URL</label>
            <input
              id="remoteEndpoint"
              type="text"
              value={tempRemoteEndpoint}
              onChange={(event) => {
                hasRemoteEditsRef.current = true;
                setTempRemoteEndpoint(event.target.value);
              }}
              onBlur={saveRemoteSettings}
            />
          </div>
          <div className="field-row-stacked">
            <label htmlFor="remoteModel">Model Name</label>
            <input
              id="remoteModel"
              type="text"
              value={tempRemoteModel}
              onChange={(event) => {
                hasRemoteEditsRef.current = true;
                setTempRemoteModel(event.target.value);
              }}
              onBlur={saveRemoteSettings}
            />
          </div>
          <div className="field-row-stacked">
            <label htmlFor="remoteApiKey">API Key (optional)</label>
            <input
              id="remoteApiKey"
              type="password"
              value={tempRemoteApiKey}
              onChange={(event) => {
                hasRemoteEditsRef.current = true;
                setTempRemoteApiKey(event.target.value);
              }}
              onBlur={saveRemoteSettings}
            />
          </div>
          {!isRemoteModelConfigured(settings) && (
            <p>Set both endpoint and model name before sending messages.</p>
          )}
          <p style={{ marginBottom: 0 }}>
            The key is stored in Clippy&apos;s local settings JSON on this
            machine.
          </p>
        </fieldset>
      )}

      <p>
        Select the model you want to use for your chat. The larger the model,
        the more powerful the chat, but the slower it will be - and the more
        memory it will use. Clippy uses models in the GGUF format.{" "}
        <a
          href="https://github.com/felixrieseberg/clippy?tab=readme-ov-file#downloading-more-models"
          target="_blank"
        >
          More information.
        </a>
      </p>

      <button
        style={{ marginBottom: 10 }}
        disabled={useRemoteModel}
        onClick={() => clippyApi.addModelFromFile()}
      >
        Add model from file
      </button>
      <div
        style={{
          opacity: useRemoteModel ? 0.6 : 1,
          pointerEvents: useRemoteModel ? "none" : "auto",
        }}
      >
        <TableView
          columns={columns}
          data={data}
          onRowSelect={handleRowSelect}
          initialSelectedIndex={selectedIndex}
        />
      </div>
      {useRemoteModel && (
        <p>
          Local models are still available, but Clippy will use your remote
          endpoint while this provider is selected.
        </p>
      )}

      {selectedModel && !useRemoteModel && (
        <div
          className="model-details sunken-panel"
          style={{ marginTop: "20px", padding: "15px" }}
        >
          <strong>{selectedModel.name}</strong>

          {selectedModel.description && <p>{selectedModel.description}</p>}

          {selectedModel.homepage && (
            <p>
              <a
                href={selectedModel.homepage}
                target="_blank"
                rel="noopener noreferrer"
              >
                Visit Homepage
              </a>
            </p>
          )}

          <div style={{ marginTop: "15px", display: "flex", gap: "10px" }}>
            {!selectedModel.downloaded ? (
              <button disabled={isDownloading} onClick={handleDownload}>
                Download Model
              </button>
            ) : (
              <>
                <button
                  disabled={isDownloading || isDefaultModel}
                  onClick={handleMakeDefault}
                >
                  {isDefaultModel
                    ? "Clippy uses this model"
                    : "Make Clippy use this model"}
                </button>
                <button onClick={handleDeleteOrRemove}>
                  {selectedModel?.imported ? "Remove" : "Delete"} Model
                </button>
              </>
            )}
          </div>
          <SettingsModelDownload model={selectedModel} />
        </div>
      )}
    </div>
  );
};

const SettingsModelDownload: React.FC<{
  model?: ManagedModel;
}> = ({ model }) => {
  if (!model || !isModelDownloading(model)) {
    return null;
  }

  const downloadSpeed = prettyDownloadSpeed(
    model?.downloadState?.currentBytesPerSecond || 0,
  );

  return (
    <div style={{ marginTop: "15px" }}>
      <p>
        Downloading {model.name}... ({downloadSpeed}/s)
      </p>
      <Progress progress={model.downloadState?.percentComplete || 0} />
    </div>
  );
};

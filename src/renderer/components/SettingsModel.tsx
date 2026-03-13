import { Column, TableView } from "./TableView";
import { Progress } from "./Progress";
import React, { useEffect, useRef, useState } from "react";
import { useSharedState } from "../contexts/SharedStateContext";
import { clippyApi } from "../clippyApi";
import { prettyDownloadSpeed } from "../helpers/convert-download-speed";
import { ManagedModel } from "../../models";
import { isModelDownloading } from "../../helpers/model-helpers";
import {
  getMcpServers,
  getRemoteProviders,
  isRemoteProvider,
  McpHeaderConfig,
  McpServerConfig,
  ModelProvider,
  RemoteProviderConfig,
} from "../../sharedState";
import { RemoteMcpServerConfig } from "../../types/remote";

type ProviderDraft = {
  name: string;
  apiKey: string;
  baseUrl: string;
  model: string;
};

type McpServerDraft = {
  name: string;
  toolId: string;
  enabled: boolean;
  runToolsAutomatically: boolean;
  type: "stdio" | "http";
  command: string;
  argsText: string;
  cwd: string;
  url: string;
  headers: McpHeaderConfig[];
};

type McpVerifyState =
  | {
      status: "idle";
      message?: string;
      tools?: Array<{ name: string; description?: string }>;
    }
  | {
      status: "working";
      message?: string;
      tools?: Array<{ name: string; description?: string }>;
    }
  | {
      status: "success";
      message?: string;
      tools: Array<{ name: string; description?: string }>;
    }
  | {
      status: "error";
      message: string;
      tools?: Array<{ name: string; description?: string }>;
    };

export const SettingsModel: React.FC = () => {
  const { models, settings } = useSharedState();
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const useRemoteModel = isRemoteProvider(settings);
  const remoteProviders = getRemoteProviders(settings);
  const mcpServers = getMcpServers(settings);
  const selectedRemoteProviderId =
    settings.selectedRemoteProviderId || remoteProviders[0]?.id;
  const selectedMcpServerId = settings.selectedMcpServerId || mcpServers[0]?.id;
  const selectedRemoteProvider = remoteProviders.find(
    (provider) => provider.id === selectedRemoteProviderId,
  );
  const selectedMcpServer = mcpServers.find(
    (server) => server.id === selectedMcpServerId,
  );
  const latestSettingsRef = useRef(settings);
  const isSavingProviderRef = useRef(false);
  const isSavingMcpRef = useRef(false);
  const providerDirtyRef = useRef(false);
  const mcpDirtyRef = useRef(false);
  const [providerDraft, setProviderDraft] = useState<ProviderDraft>(
    providerToDraft(selectedRemoteProvider),
  );
  const [mcpServerDraft, setMcpServerDraft] = useState<McpServerDraft>(
    mcpServerToDraft(selectedMcpServer),
  );
  const [mcpVerifyState, setMcpVerifyState] = useState<McpVerifyState>({
    status: "idle",
  });

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

  const selectedModel =
    models?.[modelKeys[selectedIndex] as keyof typeof models] || null;
  const isDownloading = isModelDownloading(selectedModel);
  const isDefaultModel = selectedModel?.name === settings.selectedModel;
  const isRemoteConfigComplete =
    !!providerDraft.baseUrl.trim() && !!providerDraft.model.trim();

  useEffect(() => {
    latestSettingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    if (isSavingProviderRef.current) {
      isSavingProviderRef.current = false;
      return;
    }

    if (providerDirtyRef.current) {
      return;
    }

    setProviderDraft(providerToDraft(selectedRemoteProvider));
  }, [
    selectedRemoteProvider?.id,
    selectedRemoteProvider?.name,
    selectedRemoteProvider?.apiKey,
    selectedRemoteProvider?.baseUrl,
    selectedRemoteProvider?.model,
  ]);

  useEffect(() => {
    if (isSavingMcpRef.current) {
      isSavingMcpRef.current = false;
      return;
    }

    if (mcpDirtyRef.current) {
      return;
    }

    setMcpServerDraft(mcpServerToDraft(selectedMcpServer));
    setMcpVerifyState({ status: "idle" });
  }, [
    selectedMcpServer?.id,
    selectedMcpServer?.name,
    selectedMcpServer?.toolId,
    selectedMcpServer?.enabled,
    selectedMcpServer?.runToolsAutomatically,
    selectedMcpServer?.type,
    selectedMcpServer?.command,
    selectedMcpServer?.argsText,
    selectedMcpServer?.cwd,
    selectedMcpServer?.url,
    JSON.stringify(selectedMcpServer?.headers || []),
  ]);

  const persistSettings = (
    patch: Partial<typeof settings>,
    mode?: "provider" | "mcp",
  ) => {
    if (mode === "provider") {
      isSavingProviderRef.current = true;
    }

    if (mode === "mcp") {
      isSavingMcpRef.current = true;
    }

    void clippyApi.setState("settings", {
      ...latestSettingsRef.current,
      ...patch,
    });
  };

  const saveProviderDraft = () => {
    if (!providerDirtyRef.current || !selectedRemoteProvider) {
      return;
    }

    providerDirtyRef.current = false;

    const nextProviders = remoteProviders.map((provider) =>
      provider.id === selectedRemoteProvider.id
        ? {
            ...provider,
            name: providerDraft.name || "Provider",
            apiKey: providerDraft.apiKey,
            baseUrl: providerDraft.baseUrl,
            model: providerDraft.model,
          }
        : provider,
    );

    persistSettings(
      {
        remoteProviders: nextProviders,
        remoteEndpoint: providerDraft.baseUrl,
        remoteModel: providerDraft.model,
        remoteApiKey: providerDraft.apiKey,
      },
      "provider",
    );
  };

  const saveMcpServerDraft = () => {
    if (!mcpDirtyRef.current || !selectedMcpServer) {
      return;
    }

    mcpDirtyRef.current = false;

    const nextServers = mcpServers.map((server) =>
      server.id === selectedMcpServer.id
        ? {
            ...server,
            name: mcpServerDraft.name || "MCP Server",
            toolId: mcpServerDraft.toolId || "mcp",
            enabled: mcpServerDraft.enabled,
            runToolsAutomatically: mcpServerDraft.runToolsAutomatically,
            type: mcpServerDraft.type,
            command: mcpServerDraft.command,
            argsText: mcpServerDraft.argsText,
            cwd: mcpServerDraft.cwd,
            url: mcpServerDraft.url,
            headers: mcpServerDraft.headers,
          }
        : server,
    );

    persistSettings(
      {
        mcpServers: nextServers,
        mcpEnabled:
          mcpServerDraft.type === "stdio" && mcpServerDraft.enabled
            ? mcpServerDraft.runToolsAutomatically
            : false,
        mcpServerCommand:
          mcpServerDraft.type === "stdio" ? mcpServerDraft.command : "",
        mcpServerArgs:
          mcpServerDraft.type === "stdio" ? mcpServerDraft.argsText : "",
        mcpServerCwd: mcpServerDraft.type === "stdio" ? mcpServerDraft.cwd : "",
      },
      "mcp",
    );
  };

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
    saveProviderDraft();
    saveMcpServerDraft();
    clippyApi.setState("settings.modelProvider", provider);
  };

  const handleSelectRemoteProvider = (providerId: string) => {
    if (providerId === selectedRemoteProviderId) {
      return;
    }

    saveProviderDraft();
    persistSettings(
      {
        selectedRemoteProviderId: providerId,
      },
      "provider",
    );
  };

  const handleAddRemoteProvider = () => {
    saveProviderDraft();

    const newProvider: RemoteProviderConfig = {
      id: createId("provider"),
      name: "New Provider",
      apiKey: "",
      baseUrl: "https://api.openai.com/v1/chat/completions",
      model: "",
      observed: false,
    };
    const nextProviders = [...remoteProviders, newProvider];

    persistSettings(
      {
        remoteProviders: nextProviders,
        selectedRemoteProviderId: newProvider.id,
        remoteEndpoint: newProvider.baseUrl,
        remoteModel: newProvider.model,
        remoteApiKey: newProvider.apiKey,
      },
      "provider",
    );
  };

  const handleRemoveRemoteProvider = () => {
    if (!selectedRemoteProvider || remoteProviders.length <= 1) {
      return;
    }

    const nextProviders = remoteProviders.filter(
      (provider) => provider.id !== selectedRemoteProvider.id,
    );
    const nextSelected = nextProviders[0];

    persistSettings(
      {
        remoteProviders: nextProviders,
        selectedRemoteProviderId: nextSelected?.id,
        remoteEndpoint: nextSelected?.baseUrl || "",
        remoteModel: nextSelected?.model || "",
        remoteApiKey: nextSelected?.apiKey || "",
      },
      "provider",
    );
  };

  const handleSelectMcpServer = (serverId: string) => {
    if (serverId === selectedMcpServerId) {
      return;
    }

    saveMcpServerDraft();
    persistSettings(
      {
        selectedMcpServerId: serverId,
      },
      "mcp",
    );
  };

  const handleAddMcpServer = () => {
    saveMcpServerDraft();

    const newServer: McpServerConfig = {
      id: createId("mcp"),
      name: "New MCP Server",
      toolId: `mcp_${mcpServers.length + 1}`,
      enabled: true,
      runToolsAutomatically: true,
      type: "stdio",
      command: "",
      argsText: "",
      cwd: "",
      url: "",
      headers: [],
    };
    const nextServers = [...mcpServers, newServer];

    persistSettings(
      {
        mcpServers: nextServers,
        selectedMcpServerId: newServer.id,
      },
      "mcp",
    );
  };

  const handleRemoveMcpServer = () => {
    if (!selectedMcpServer) {
      return;
    }

    const nextServers = mcpServers.filter(
      (server) => server.id !== selectedMcpServer.id,
    );
    const nextSelected = nextServers[0]?.id;

    persistSettings(
      {
        mcpServers: nextServers,
        selectedMcpServerId: nextSelected,
      },
      "mcp",
    );
  };

  const handleVerifyMcpServer = async () => {
    if (!selectedMcpServer) {
      return;
    }

    saveMcpServerDraft();
    setMcpVerifyState({ status: "working", message: "Verifying..." });

    const result = await clippyApi.verifyMcpServer(
      draftToRemoteMcpServerConfig(selectedMcpServer.id, mcpServerDraft),
    );

    if (result.ok) {
      setMcpVerifyState({
        status: "success",
        message: `Found ${result.tools.length} tool(s).`,
        tools: result.tools,
      });
    } else {
      setMcpVerifyState({
        status: "error",
        message: result.error || "Verification failed.",
      });
    }
  };

  return (
    <div>
      <fieldset>
        <legend>Provider Mode</legend>
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
        <>
          <fieldset style={{ marginTop: 20 }}>
            <legend>Remote Providers</legend>
            <div style={{ display: "grid", gridTemplateColumns: "220px 1fr" }}>
              <div style={{ paddingRight: 12 }}>
                <div className="sunken-panel" style={{ minHeight: 180 }}>
                  {remoteProviders.map((provider) => (
                    <button
                      key={provider.id}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        marginBottom: 4,
                        background:
                          provider.id === selectedRemoteProviderId
                            ? "#c0c0c0"
                            : undefined,
                      }}
                      onClick={() => handleSelectRemoteProvider(provider.id)}
                    >
                      {provider.name || "Provider"}
                    </button>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  <button onClick={handleAddRemoteProvider}>Add</button>
                  <button
                    onClick={handleRemoveRemoteProvider}
                    disabled={remoteProviders.length <= 1}
                  >
                    Remove
                  </button>
                </div>
              </div>

              <div>
                {selectedRemoteProvider ? (
                  <>
                    <div className="field-row-stacked">
                      <label htmlFor="providerName">Name</label>
                      <input
                        id="providerName"
                        type="text"
                        value={providerDraft.name}
                        onChange={(event) => {
                          providerDirtyRef.current = true;
                          setProviderDraft((prev) => ({
                            ...prev,
                            name: event.target.value,
                          }));
                        }}
                        onBlur={saveProviderDraft}
                      />
                    </div>
                    <div className="field-row-stacked">
                      <label htmlFor="providerApiKey">API Key</label>
                      <input
                        id="providerApiKey"
                        type="password"
                        value={providerDraft.apiKey}
                        onChange={(event) => {
                          providerDirtyRef.current = true;
                          setProviderDraft((prev) => ({
                            ...prev,
                            apiKey: event.target.value,
                          }));
                        }}
                        onBlur={saveProviderDraft}
                      />
                    </div>
                    <div className="field-row-stacked">
                      <label htmlFor="providerBaseUrl">API Base URL</label>
                      <input
                        id="providerBaseUrl"
                        type="text"
                        value={providerDraft.baseUrl}
                        onChange={(event) => {
                          providerDirtyRef.current = true;
                          setProviderDraft((prev) => ({
                            ...prev,
                            baseUrl: event.target.value,
                          }));
                        }}
                        onBlur={saveProviderDraft}
                      />
                    </div>
                    <div className="field-row-stacked">
                      <label htmlFor="providerModel">Model</label>
                      <input
                        id="providerModel"
                        type="text"
                        value={providerDraft.model}
                        onChange={(event) => {
                          providerDirtyRef.current = true;
                          setProviderDraft((prev) => ({
                            ...prev,
                            model: event.target.value,
                          }));
                        }}
                        onBlur={saveProviderDraft}
                      />
                    </div>
                    <p style={{ marginBottom: 0 }}>
                      {selectedRemoteProvider.observed
                        ? "Observed"
                        : "Not observed"}
                    </p>
                  </>
                ) : (
                  <p>Add a provider to begin.</p>
                )}
              </div>
            </div>

            {!isRemoteConfigComplete && (
              <p>Set API Base URL and Model before sending messages.</p>
            )}
            <p style={{ marginBottom: 0 }}>
              API keys are stored in Clippy&apos;s local settings JSON on this
              machine.
            </p>
          </fieldset>

          <fieldset style={{ marginTop: 20 }}>
            <legend>MCP Servers</legend>
            <div style={{ display: "grid", gridTemplateColumns: "220px 1fr" }}>
              <div style={{ paddingRight: 12 }}>
                <div className="sunken-panel" style={{ minHeight: 220 }}>
                  {mcpServers.map((server) => (
                    <button
                      key={server.id}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        marginBottom: 4,
                        background:
                          server.id === selectedMcpServerId
                            ? "#c0c0c0"
                            : undefined,
                      }}
                      onClick={() => handleSelectMcpServer(server.id)}
                    >
                      {server.name || "MCP Server"}
                    </button>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  <button onClick={handleAddMcpServer}>Add</button>
                  <button
                    onClick={handleRemoveMcpServer}
                    disabled={!selectedMcpServer}
                  >
                    Remove
                  </button>
                </div>
              </div>

              <div>
                {selectedMcpServer ? (
                  <>
                    <div className="field-row">
                      <input
                        id="mcpServerEnabled"
                        type="checkbox"
                        checked={mcpServerDraft.enabled}
                        onChange={(event) => {
                          mcpDirtyRef.current = true;
                          setMcpServerDraft((prev) => ({
                            ...prev,
                            enabled: event.target.checked,
                          }));
                          setTimeout(saveMcpServerDraft, 0);
                        }}
                      />
                      <label htmlFor="mcpServerEnabled">Enabled</label>
                    </div>
                    <div className="field-row-stacked">
                      <label htmlFor="mcpServerType">Type</label>
                      <select
                        id="mcpServerType"
                        value={mcpServerDraft.type}
                        onChange={(event) => {
                          mcpDirtyRef.current = true;
                          setMcpServerDraft((prev) => ({
                            ...prev,
                            type: event.target.value as "stdio" | "http",
                          }));
                          setTimeout(saveMcpServerDraft, 0);
                        }}
                      >
                        <option value="stdio">stdio</option>
                        <option value="http">http</option>
                      </select>
                    </div>
                    <div className="field-row-stacked">
                      <label htmlFor="mcpServerName">Name</label>
                      <input
                        id="mcpServerName"
                        type="text"
                        value={mcpServerDraft.name}
                        onChange={(event) => {
                          mcpDirtyRef.current = true;
                          setMcpServerDraft((prev) => ({
                            ...prev,
                            name: event.target.value,
                          }));
                        }}
                        onBlur={saveMcpServerDraft}
                      />
                    </div>
                    <div className="field-row-stacked">
                      <label htmlFor="mcpToolId">ID</label>
                      <input
                        id="mcpToolId"
                        type="text"
                        value={mcpServerDraft.toolId}
                        onChange={(event) => {
                          mcpDirtyRef.current = true;
                          setMcpServerDraft((prev) => ({
                            ...prev,
                            toolId: event.target.value,
                          }));
                        }}
                        onBlur={saveMcpServerDraft}
                      />
                    </div>

                    {mcpServerDraft.type === "http" ? (
                      <>
                        <div className="field-row-stacked">
                          <label htmlFor="mcpServerUrl">URL</label>
                          <input
                            id="mcpServerUrl"
                            type="text"
                            value={mcpServerDraft.url}
                            onChange={(event) => {
                              mcpDirtyRef.current = true;
                              setMcpServerDraft((prev) => ({
                                ...prev,
                                url: event.target.value,
                              }));
                            }}
                            onBlur={saveMcpServerDraft}
                          />
                        </div>
                        <p>HTTP Headers</p>
                        {mcpServerDraft.headers.map((header, index) => (
                          <div
                            className="field-row"
                            key={header.id || `${index}-header`}
                          >
                            <input
                              type="text"
                              value={header.key}
                              placeholder="Header"
                              onChange={(event) => {
                                mcpDirtyRef.current = true;
                                setMcpServerDraft((prev) => ({
                                  ...prev,
                                  headers: prev.headers.map((currentHeader) =>
                                    currentHeader.id === header.id
                                      ? {
                                          ...currentHeader,
                                          key: event.target.value,
                                        }
                                      : currentHeader,
                                  ),
                                }));
                              }}
                              onBlur={saveMcpServerDraft}
                            />
                            <input
                              type="text"
                              value={header.value}
                              placeholder="Value"
                              onChange={(event) => {
                                mcpDirtyRef.current = true;
                                setMcpServerDraft((prev) => ({
                                  ...prev,
                                  headers: prev.headers.map((currentHeader) =>
                                    currentHeader.id === header.id
                                      ? {
                                          ...currentHeader,
                                          value: event.target.value,
                                        }
                                      : currentHeader,
                                  ),
                                }));
                              }}
                              onBlur={saveMcpServerDraft}
                            />
                            <button
                              onClick={() => {
                                mcpDirtyRef.current = true;
                                setMcpServerDraft((prev) => ({
                                  ...prev,
                                  headers: prev.headers.filter(
                                    (currentHeader) =>
                                      currentHeader.id !== header.id,
                                  ),
                                }));
                                setTimeout(saveMcpServerDraft, 0);
                              }}
                            >
                              -
                            </button>
                          </div>
                        ))}
                        <button
                          onClick={() => {
                            mcpDirtyRef.current = true;
                            setMcpServerDraft((prev) => ({
                              ...prev,
                              headers: [
                                ...prev.headers,
                                { id: createId("header"), key: "", value: "" },
                              ],
                            }));
                          }}
                        >
                          Add Header
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="field-row-stacked">
                          <label htmlFor="mcpServerCommand">Command</label>
                          <input
                            id="mcpServerCommand"
                            type="text"
                            value={mcpServerDraft.command}
                            onChange={(event) => {
                              mcpDirtyRef.current = true;
                              setMcpServerDraft((prev) => ({
                                ...prev,
                                command: event.target.value,
                              }));
                            }}
                            onBlur={saveMcpServerDraft}
                          />
                        </div>
                        <div className="field-row-stacked">
                          <label htmlFor="mcpServerArgs">Args</label>
                          <input
                            id="mcpServerArgs"
                            type="text"
                            value={mcpServerDraft.argsText}
                            onChange={(event) => {
                              mcpDirtyRef.current = true;
                              setMcpServerDraft((prev) => ({
                                ...prev,
                                argsText: event.target.value,
                              }));
                            }}
                            onBlur={saveMcpServerDraft}
                          />
                        </div>
                        <div className="field-row-stacked">
                          <label htmlFor="mcpServerCwd">Working Dir</label>
                          <input
                            id="mcpServerCwd"
                            type="text"
                            value={mcpServerDraft.cwd}
                            onChange={(event) => {
                              mcpDirtyRef.current = true;
                              setMcpServerDraft((prev) => ({
                                ...prev,
                                cwd: event.target.value,
                              }));
                            }}
                            onBlur={saveMcpServerDraft}
                          />
                        </div>
                      </>
                    )}

                    <div className="field-row">
                      <input
                        id="mcpAutoRun"
                        type="checkbox"
                        checked={mcpServerDraft.runToolsAutomatically}
                        onChange={(event) => {
                          mcpDirtyRef.current = true;
                          setMcpServerDraft((prev) => ({
                            ...prev,
                            runToolsAutomatically: event.target.checked,
                          }));
                          setTimeout(saveMcpServerDraft, 0);
                        }}
                      />
                      <label htmlFor="mcpAutoRun">
                        Run tools automatically
                      </label>
                    </div>
                    <div className="field-row-stacked" style={{ marginTop: 8 }}>
                      <button
                        disabled={mcpVerifyState.status === "working"}
                        onClick={handleVerifyMcpServer}
                      >
                        {mcpVerifyState.status === "working"
                          ? "Verifying..."
                          : "Verify (View Tools)"}
                      </button>
                    </div>

                    {mcpVerifyState.status === "success" && (
                      <div style={{ marginTop: 8 }}>
                        <p>{mcpVerifyState.message}</p>
                        <div
                          className="sunken-panel"
                          style={{ maxHeight: 120 }}
                        >
                          {mcpVerifyState.tools.map((tool) => (
                            <div key={tool.name}>
                              <strong>{tool.name}</strong>
                              {tool.description ? ` - ${tool.description}` : ""}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {mcpVerifyState.status === "error" && (
                      <p style={{ marginTop: 8 }}>{mcpVerifyState.message}</p>
                    )}
                  </>
                ) : (
                  <p>Add an MCP server to begin.</p>
                )}
              </div>
            </div>
          </fieldset>
        </>
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
          Local models are still available, but Clippy will use your selected
          remote provider while this mode is active.
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

function providerToDraft(provider?: RemoteProviderConfig): ProviderDraft {
  return {
    name: provider?.name || "",
    apiKey: provider?.apiKey || "",
    baseUrl: provider?.baseUrl || "",
    model: provider?.model || "",
  };
}

function mcpServerToDraft(server?: McpServerConfig): McpServerDraft {
  return {
    name: server?.name || "",
    toolId: server?.toolId || "",
    enabled: !!server?.enabled,
    runToolsAutomatically: !!server?.runToolsAutomatically,
    type: server?.type || "stdio",
    command: server?.command || "",
    argsText: server?.argsText || "",
    cwd: server?.cwd || "",
    url: server?.url || "",
    headers: server?.headers || [],
  };
}

function draftToRemoteMcpServerConfig(
  serverId: string,
  draft: McpServerDraft,
): RemoteMcpServerConfig {
  return {
    id: serverId,
    name: draft.name || "MCP Server",
    toolId: draft.toolId || "mcp",
    enabled: draft.enabled,
    runToolsAutomatically: draft.runToolsAutomatically,
    type: draft.type,
    command: draft.command,
    argsText: draft.argsText,
    cwd: draft.cwd,
    url: draft.url,
    headers: draft.headers.map((header) => ({
      key: header.key,
      value: header.value,
    })),
  };
}

function createId(prefix: string): string {
  return `${prefix}-${Math.floor(Date.now() / 1000)}-${crypto
    .randomUUID()
    .slice(0, 8)}`;
}

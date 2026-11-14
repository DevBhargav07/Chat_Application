import { useEffect, useState, useMemo } from "react";
import { toast } from "sonner";
import {
  Globe,
  MapPin,
  EyeOff,
  Shield,
  Check,
  Search,
  AlertCircle,
  Sparkles,
  RotateCcw,
  Info,
} from "lucide-react";
import { getRegions, getMyVisibility, updateMyVisibility } from "../api/auth";

export default function VisibilitySettings() {
  const [regions, setRegions] = useState([]);
  const [visibility, setVisibility] = useState("nobody");
  const [selectedRegionIds, setSelectedRegionIds] = useState([]);
  const [initialData, setInitialData] = useState({ visibility: "nobody", regionIds: [] });
  const [regionFilter, setRegionFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let ignore = false;

    const load = async () => {
      try {
        const [regionsRes, visRes] = await Promise.all([
          getRegions(),
          getMyVisibility(),
        ]);
        if (!ignore) {
          const regionList = regionsRes.data || [];
          const vis = visRes.data?.visibility || "nobody";
          const rIds = (visRes.data?.regions || []).map((r) => r.id);

          setRegions(regionList);
          setVisibility(vis);
          setSelectedRegionIds(rIds);
          setInitialData({ visibility: vis, regionIds: rIds });
        }
      } catch (error) {
        if (!ignore) {
          toast.error(error.response?.data?.detail || "Failed to load visibility settings");
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    };

    load();
    return () => {
      ignore = true;
    };
  }, []);

  const hasChanges = useMemo(() => {
    if (visibility !== initialData.visibility) return true;
    if (visibility === "region") {
      if (selectedRegionIds.length !== initialData.regionIds.length) return true;
      const initialSet = new Set(initialData.regionIds);
      return selectedRegionIds.some((id) => !initialSet.has(id));
    }
    return false;
  }, [visibility, selectedRegionIds, initialData]);

  const filteredRegions = useMemo(() => {
    if (!regionFilter.trim()) return regions;
    const term = regionFilter.toLowerCase();
    return regions.filter(
      (r) =>
        r.name?.toLowerCase().includes(term) ||
        r.code?.toLowerCase().includes(term)
    );
  }, [regions, regionFilter]);

  const toggleRegion = (regionId) => {
    setSelectedRegionIds((prev) =>
      prev.includes(regionId) ? prev.filter((id) => id !== regionId) : [...prev, regionId]
    );
  };

  const handleSelectAll = () => {
    setSelectedRegionIds(regions.map((r) => r.id));
  };

  const handleClearAll = () => {
    setSelectedRegionIds([]);
  };

  const handleReset = () => {
    setVisibility(initialData.visibility);
    setSelectedRegionIds(initialData.regionIds);
    toast.info("Changes reverted");
  };

  const handleSave = async () => {
    if (visibility === "region" && selectedRegionIds.length === 0) {
      toast.error("Please select at least one region for regional visibility.");
      return;
    }

    setSaving(true);
    try {
      const res = await updateMyVisibility(visibility, selectedRegionIds);
      const updatedVis = res?.data?.visibility || visibility;
      const updatedRegions = (res?.data?.regions || []).map((r) => r.id);

      setVisibility(updatedVis);
      setSelectedRegionIds(updatedRegions);
      setInitialData({ visibility: updatedVis, regionIds: updatedRegions });
      toast.success("Visibility preferences saved successfully!");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to update visibility preferences");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="page-content visibility-page">
        <div className="visibility-loading">
          <div className="visibility-spinner" />
          <p>Loading your visibility preferences...</p>
        </div>
      </div>
    );
  }

  const currentModeInfo = {
    everyone: { label: "Public (Everyone)", badgeClass: "badge-public", icon: Globe },
    region: { label: `Regional (${selectedRegionIds.length} regions)`, badgeClass: "badge-region", icon: MapPin },
    nobody: { label: "Hidden (Invisible)", badgeClass: "badge-private", icon: EyeOff },
  }[visibility] || { label: visibility, badgeClass: "", icon: Shield };

  const CurrentIcon = currentModeInfo.icon;

  return (
    <div className="page-content visibility-page">
      {/* Header */}
      <div className="visibility-header">
        <div className="visibility-header-left">
          <div className="visibility-title-row">
            <h1>Chat Visibility & Discovery</h1>
            <span className={`visibility-status-pill ${currentModeInfo.badgeClass}`}>
              <CurrentIcon size={14} />
              <span>{currentModeInfo.label}</span>
            </span>
          </div>
          <p className="visibility-subtitle">
            Control your presence across the organization. Determine who can discover your profile,
            view your status, and reach out to you via direct chat.
          </p>
        </div>
      </div>

      {/* Visibility Mode Selector Cards */}
      <div className="visibility-section">
        <h2 className="visibility-section-title">Select Who Can Discover You</h2>
        <div className="visibility-cards-grid">
          {/* Option 1: Everyone */}
          <div
            className={`visibility-card ${visibility === "everyone" ? "active" : ""}`}
            onClick={() => setVisibility("everyone")}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && setVisibility("everyone")}
          >
            <div className="visibility-card-radio">
              <input
                type="radio"
                name="visibilityMode"
                checked={visibility === "everyone"}
                onChange={() => setVisibility("everyone")}
                aria-label="Everyone (Public)"
              />
            </div>
            <div className="visibility-card-icon globe-icon">
              <Globe size={24} />
            </div>
            <div className="visibility-card-body">
              <div className="visibility-card-header">
                <h3>Everyone (Public)</h3>
                <span className="visibility-tag tag-open">All Members</span>
              </div>
              <p>
                You appear in the global directory. Any authenticated colleague can find you and start
                a direct chat with you, regardless of their location.
              </p>
            </div>
            {visibility === "everyone" && (
              <div className="visibility-card-check">
                <Check size={18} />
              </div>
            )}
          </div>

          {/* Option 2: Regional */}
          <div
            className={`visibility-card ${visibility === "region" ? "active" : ""}`}
            onClick={() => setVisibility("region")}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && setVisibility("region")}
          >
            <div className="visibility-card-radio">
              <input
                type="radio"
                name="visibilityMode"
                checked={visibility === "region"}
                onChange={() => setVisibility("region")}
                aria-label="Selected Regions Only"
              />
            </div>
            <div className="visibility-card-icon pin-icon">
              <MapPin size={24} />
            </div>
            <div className="visibility-card-body">
              <div className="visibility-card-header">
                <h3>Selected Regions Only</h3>
                <span className="visibility-tag tag-matched">Geographic</span>
              </div>
              <p>
                Only teammates who share at least one assigned region with you can discover you in the
                people directory and chat with you.
              </p>
            </div>
            {visibility === "region" && (
              <div className="visibility-card-check">
                <Check size={18} />
              </div>
            )}
          </div>

          {/* Option 3: Nobody */}
          <div
            className={`visibility-card ${visibility === "nobody" ? "active" : ""}`}
            onClick={() => setVisibility("nobody")}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && setVisibility("nobody")}
          >
            <div className="visibility-card-radio">
              <input
                type="radio"
                name="visibilityMode"
                checked={visibility === "nobody"}
                onChange={() => setVisibility("nobody")}
                aria-label="Nobody (Invisible)"
              />
            </div>
            <div className="visibility-card-icon eye-icon">
              <EyeOff size={24} />
            </div>
            <div className="visibility-card-body">
              <div className="visibility-card-header">
                <h3>Nobody (Invisible)</h3>
                <span className="visibility-tag tag-private">Private</span>
              </div>
              <p>
                You are completely hidden from discovery and new direct chat requests. Ongoing chats
                you have already opened remain active.
              </p>
            </div>
            {visibility === "nobody" && (
              <div className="visibility-card-check">
                <Check size={18} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Region Picker Section: only visible when Regional mode is selected */}
      {visibility === "region" && (
        <div className="visibility-section regions-picker-section">
          <div className="regions-picker-header">
            <div>
              <h2 className="visibility-section-title">Configure Your Active Regions</h2>
              <p className="regions-picker-sub">
                Choose the regions you belong to. Members assigned to any of these regions will be able
                to see and chat with you.
              </p>
            </div>
            <div className="regions-picker-actions">
              <button
                type="button"
                className="btn-text-action"
                onClick={handleSelectAll}
                disabled={selectedRegionIds.length === regions.length}
              >
                Select All
              </button>
              <span className="btn-action-divider">•</span>
              <button
                type="button"
                className="btn-text-action"
                onClick={handleClearAll}
                disabled={selectedRegionIds.length === 0}
              >
                Clear All
              </button>
            </div>
          </div>

          {/* Filter Bar & Count */}
          <div className="regions-filter-bar">
            <div className="regions-search-wrap">
              <Search size={16} className="regions-search-icon" />
              <input
                type="text"
                className="regions-search-input"
                placeholder="Search regions by name or code..."
                value={regionFilter}
                onChange={(e) => setRegionFilter(e.target.value)}
              />
            </div>
            <div className="regions-count-pill">
              <span>{selectedRegionIds.length}</span> of <span>{regions.length}</span> selected
            </div>
          </div>

          {/* Warning banner if 0 regions selected */}
          {selectedRegionIds.length === 0 && (
            <div className="visibility-alert alert-warning">
              <AlertCircle size={18} />
              <span>
                Please select at least one region. Without a region selected, regional matching cannot function.
              </span>
            </div>
          )}

          {/* Region Chips / Badges Grid */}
          <div className="regions-grid">
            {filteredRegions.map((region) => {
              const isSelected = selectedRegionIds.includes(region.id);
              return (
                <div
                  key={region.id}
                  className={`region-chip ${isSelected ? "selected" : ""}`}
                  onClick={() => toggleRegion(region.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && toggleRegion(region.id)}
                >
                  <div className="region-chip-checkbox">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleRegion(region.id)}
                      aria-label={region.name}
                    />
                  </div>
                  <div className="region-chip-content">
                    <span className="region-chip-name">{region.name}</span>
                    {region.code && (
                      <span className="region-chip-code">{region.code}</span>
                    )}
                  </div>
                  {isSelected && (
                    <div className="region-chip-indicator">
                      <Check size={14} />
                    </div>
                  )}
                </div>
              );
            })}
            {filteredRegions.length === 0 && (
              <div className="regions-empty">
                <p>No regions matched &ldquo;{regionFilter}&rdquo;</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Info Callout */}
      <div className="visibility-info-card">
        <div className="visibility-info-icon">
          <Info size={20} />
        </div>
        <div className="visibility-info-body">
          <h4>How Visibility & Privacy Work</h4>
          <ul>
            <li>
              <strong>Instant updates:</strong> Changing your visibility immediately updates who can
              find you in the People tab.
            </li>
            <li>
              <strong>Existing conversations are never broken:</strong> Even if you switch to Invisible,
              you can still communicate with people you already have an open chat history with.
            </li>
            <li>
              <strong>Regional discovery:</strong> Matching is bidirectional. If User A is in Europe and
              User B is in Europe, they both see each other when regional matching is enabled.
            </li>
          </ul>
        </div>
      </div>

      {/* Floating or Bottom Action Bar */}
      <div className="visibility-actions-bar">
        <div className="visibility-actions-left">
          {hasChanges && (
            <span className="visibility-unsaved-badge">
              <Sparkles size={14} />
              Unsaved changes
            </span>
          )}
        </div>
        <div className="visibility-actions-right">
          {hasChanges && (
            <button
              type="button"
              className="btn-secondary"
              onClick={handleReset}
              disabled={saving}
            >
              <RotateCcw size={16} />
              <span>Reset</span>
            </button>
          )}
          <button
            type="button"
            className="btn-primary"
            onClick={handleSave}
            disabled={saving || (visibility === "region" && selectedRegionIds.length === 0)}
          >
            {saving ? "Saving Preferences..." : "Save Visibility Settings"}
          </button>
        </div>
      </div>
    </div>
  );
}

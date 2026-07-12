import { NavLink } from "react-router-dom";
import {
  FEATURE_REGISTRY,
  SIDEBAR_SECTIONS,
  featuresForSection,
} from "../constants/features";
import { SIDEBAR_WIDTH_PX } from "../constants/motion";

export function Sidebar() {
  return (
    <nav
      className="hf-sidebar"
      data-testid="app-sidebar"
      style={{ ["--sidebar-width" as string]: `${SIDEBAR_WIDTH_PX}px` }}
      aria-label="Primary"
    >
      <div className="hf-sidebar__brand" data-testid="sidebar-brand">
        Hyperflow
      </div>
      {SIDEBAR_SECTIONS.map((section) => {
        const items = featuresForSection(section.id);
        if (items.length === 0) return null;
        return (
          <div
            key={section.id}
            className="hf-sidebar__section"
            data-testid={`sidebar-section-${section.id}`}
          >
            <div className="hf-sidebar__section-label">{section.label}</div>
            {items.map((feature) => (
              <NavLink
                key={feature.id}
                to={feature.route}
                className={({ isActive }) =>
                  isActive
                    ? "hf-sidebar__item hf-sidebar__item--active"
                    : "hf-sidebar__item"
                }
                data-testid={`sidebar-item-${feature.id}`}
                end
              >
                {feature.label}
              </NavLink>
            ))}
          </div>
        );
      })}
      <span className="hf-visually-hidden" aria-hidden>
        {FEATURE_REGISTRY.length} surfaces
      </span>
    </nav>
  );
}

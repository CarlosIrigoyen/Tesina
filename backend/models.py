from database import Base
from geoalchemy2 import Geometry
from sqlalchemy import Column, Integer, String, Float


class RadioCensal(Base):
    __tablename__ = "radios_censales"

    id = Column(Integer, primary_key=True, index=True)
    link = Column(String(20), unique=True, nullable=False, index=True)
    geom = Column(Geometry(geometry_type="MULTIPOLYGON", srid=4326))


class IndiceRadio(Base):
    __tablename__ = "indices_radios"

    id = Column(Integer, primary_key=True, index=True)
    link = Column(String(20), unique=True, nullable=False, index=True)
    actividad = Column(Float)
    carencias_sanitarias = Column(Float)
    demografia = Column(Float)
    educacion = Column(Float)
    fuente_agua = Column(Float)
    infraestructuta = Column(Float)
    salud = Column(Float)
    indice_compuesto = Column(Float)
